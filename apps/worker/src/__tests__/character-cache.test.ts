/**
 * Worker character-cache tests.
 *
 * Exercises the worker's cache-and-flush layer for `client:set_character`:
 *
 *   - `set_character` sent before the DM bridge connects is cached (no NO_DM error).
 *   - When the DM bridge joins, every cached character is flushed as a
 *     `server:player_action` wrapping `client:set_character`.
 *   - When the bridge broadcasts `server:character_updated` via `client:broadcast`,
 *     the worker's cache updates too, so reconnecting clients and re-flushes see
 *     the latest version.
 *   - `server:room_joined` includes the cached `characters` record.
 *   - Kicking a player removes their cached character.
 *   - DM reconnect re-flushes the full roster to the new bridge.
 */

import { SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { buildCharacter } from "@unseen-servant/shared/builders";
import {
  makeFighterBuilderState,
  makeClericBuilderState,
} from "@unseen-servant/shared/test-helpers";
import type { CharacterData } from "@unseen-servant/shared/types";

// ---------------------------------------------------------------------------
// Helpers (mirror the ones in game-room.test.ts, kept local to avoid coupling)
// ---------------------------------------------------------------------------

interface ParsedMessage {
  type: string;
  [key: string]: unknown;
}

async function createRoom(): Promise<string> {
  const resp = await SELF.fetch("http://localhost/api/rooms/create", { method: "POST" });
  expect(resp.status).toBe(200);
  const data = (await resp.json()) as { roomCode: string };
  return data.roomCode;
}

async function openWebSocket(roomCode: string): Promise<WebSocket> {
  const resp = await SELF.fetch(`http://localhost/api/rooms/${roomCode}/ws`, {
    headers: { Upgrade: "websocket" },
  });
  expect(resp.status).toBe(101);
  const ws = resp.webSocket;
  if (!ws) throw new Error("Expected WebSocket in response");
  ws.accept();
  return ws;
}

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: ParsedMessage) => boolean,
  timeoutMs = 5000,
): Promise<ParsedMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("waitForMessage timeout")), timeoutMs);
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ParsedMessage;
      if (predicate(msg)) {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(msg);
      }
    };
    ws.addEventListener("message", handler);
  });
}

function expectNoMessage(
  ws: WebSocket,
  predicate: (msg: ParsedMessage) => boolean,
  windowMs = 300,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ParsedMessage;
      if (predicate(msg)) {
        ws.removeEventListener("message", handler);
        reject(new Error(`Unexpected message: ${JSON.stringify(msg)}`));
      }
    };
    ws.addEventListener("message", handler);
    setTimeout(() => {
      ws.removeEventListener("message", handler);
      resolve();
    }, windowMs);
  });
}

async function joinAs(
  roomCode: string,
  playerName: string,
  opts: { guestId?: string; isDM?: boolean } = {},
): Promise<WebSocket> {
  const ws = await openWebSocket(roomCode);
  ws.send(
    JSON.stringify({
      type: "client:join",
      playerName,
      roomCode,
      guestId: opts.guestId ?? `guest-${playerName}`,
      ...(opts.isDM !== undefined && { isDM: opts.isDM }),
    }),
  );
  await waitForMessage(ws, (m) => m.type === "server:room_joined");
  return ws;
}

function fighter(): CharacterData {
  return buildCharacter(makeFighterBuilderState()).character;
}

function cleric(): CharacterData {
  return buildCharacter(makeClericBuilderState()).character;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("character cache — set_character before DM connects", () => {
  let code: string;

  beforeEach(async () => {
    code = await createRoom();
  });

  it("set_character sent before DM connects does not return a NO_DM error", async () => {
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    const noError = expectNoMessage(host, (m) => m.type === "server:error");
    host.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    await noError; // would reject if NO_DM error arrived
    host.close();
  });

  it("cached character is flushed to the bridge when it connects", async () => {
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    host.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    // Give the DO a tick to cache + persist
    await new Promise((r) => setTimeout(r, 50));

    const bridge = await openWebSocket(code);
    bridge.send(
      JSON.stringify({
        type: "client:join",
        playerName: "DM",
        roomCode: code,
        guestId: "guest-bridge",
        isDM: true,
      }),
    );

    const action = await waitForMessage(
      bridge,
      (m) =>
        m.type === "server:player_action" &&
        typeof m.action === "object" &&
        m.action !== null &&
        (m.action as { type?: string }).type === "client:set_character",
    );
    expect(action.playerName).toBe("Host");
    const forwarded = action.action as { character: CharacterData };
    expect(forwarded.character.static.name).toBe(fighter().static.name);

    host.close();
    bridge.close();
  });

  it("multiple cached characters are all flushed on DM connect", async () => {
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    const player = await joinAs(code, "Player", { guestId: "guest-player" });

    host.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    player.send(JSON.stringify({ type: "client:set_character", character: cleric() }));
    await new Promise((r) => setTimeout(r, 80));

    const bridge = await openWebSocket(code);
    const received: string[] = [];
    bridge.addEventListener("message", (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ParsedMessage;
      if (
        msg.type === "server:player_action" &&
        (msg.action as { type?: string } | null)?.type === "client:set_character"
      ) {
        received.push(msg.playerName as string);
      }
    });

    bridge.send(
      JSON.stringify({
        type: "client:join",
        playerName: "DM",
        roomCode: code,
        guestId: "guest-bridge",
        isDM: true,
      }),
    );

    // Wait for the flush to arrive
    await new Promise((r) => setTimeout(r, 300));
    expect(received.sort()).toEqual(["Host", "Player"]);

    host.close();
    player.close();
    bridge.close();
  });
});

describe("character cache — bridge broadcast round-trip", () => {
  let code: string;

  beforeEach(async () => {
    code = await createRoom();
  });

  it("server:character_updated from the bridge updates the worker cache", async () => {
    // Host caches a character before the bridge connects.
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    host.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    await new Promise((r) => setTimeout(r, 40));

    // Bridge joins and broadcasts an updated sheet (simulates HP change, etc).
    const bridge = await joinAs(code, "DM", { guestId: "guest-bridge", isDM: true });
    const updated = cleric(); // different static data stands in for an edit
    bridge.send(
      JSON.stringify({
        type: "client:broadcast",
        payload: {
          type: "server:character_updated",
          playerName: "Host",
          character: updated,
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 40));

    // A new client joining should see the updated character in room_joined.
    const observer = await openWebSocket(code);
    observer.send(
      JSON.stringify({
        type: "client:join",
        playerName: "Observer",
        roomCode: code,
        guestId: "guest-observer",
      }),
    );
    const joined = await waitForMessage(observer, (m) => m.type === "server:room_joined");
    const characters = joined.characters as Record<string, CharacterData> | undefined;
    expect(characters).toBeDefined();
    expect(characters?.Host.static.name).toBe(updated.static.name);

    host.close();
    bridge.close();
    observer.close();
  });

  it("DM reconnect re-flushes the full roster", async () => {
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    host.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    await new Promise((r) => setTimeout(r, 40));

    // First bridge connects, receives flush, then disconnects.
    const bridge1 = await joinAs(code, "DM", { guestId: "guest-bridge", isDM: true });
    await waitForMessage(
      bridge1,
      (m) =>
        m.type === "server:player_action" &&
        (m.action as { type?: string } | null)?.type === "client:set_character",
    );
    bridge1.close();
    await new Promise((r) => setTimeout(r, 100));

    // Second bridge connects — cache must still be present and flushed.
    const bridge2 = await openWebSocket(code);
    bridge2.send(
      JSON.stringify({
        type: "client:join",
        playerName: "DM",
        roomCode: code,
        guestId: "guest-bridge",
        isDM: true,
      }),
    );
    const reflush = await waitForMessage(
      bridge2,
      (m) =>
        m.type === "server:player_action" &&
        (m.action as { type?: string } | null)?.type === "client:set_character",
    );
    expect(reflush.playerName).toBe("Host");

    host.close();
    bridge2.close();
  });
});

describe("character cache — server:room_joined payload", () => {
  let code: string;

  beforeEach(async () => {
    code = await createRoom();
  });

  it("includes cached characters for reconnecting clients", async () => {
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    host.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    await new Promise((r) => setTimeout(r, 40));
    host.close();
    await new Promise((r) => setTimeout(r, 80));

    const reconnect = await openWebSocket(code);
    reconnect.send(
      JSON.stringify({
        type: "client:join",
        playerName: "Host",
        roomCode: code,
        guestId: "guest-host",
      }),
    );
    const joined = await waitForMessage(reconnect, (m) => m.type === "server:room_joined");
    const characters = joined.characters as Record<string, CharacterData> | undefined;
    expect(characters).toBeDefined();
    expect(Object.keys(characters!)).toContain("Host");
    reconnect.close();
  });

  it("omits characters field when no characters are cached", async () => {
    const host = await openWebSocket(code);
    host.send(
      JSON.stringify({
        type: "client:join",
        playerName: "Host",
        roomCode: code,
        guestId: "guest-host",
      }),
    );
    const joined = await waitForMessage(host, (m) => m.type === "server:room_joined");
    expect(joined.characters).toBeUndefined();
    host.close();
  });
});

describe("character cache — lifecycle", () => {
  let code: string;

  beforeEach(async () => {
    code = await createRoom();
  });

  it("kicking a player removes their character from the cache", async () => {
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    const player = await joinAs(code, "Player", { guestId: "guest-player" });
    player.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    await new Promise((r) => setTimeout(r, 40));

    host.send(JSON.stringify({ type: "client:kick_player", playerName: "Player" }));
    await waitForMessage(host, (m) => m.type === "server:player_left");

    // New observer joins — Player's character should no longer be in the roster.
    const observer = await openWebSocket(code);
    observer.send(
      JSON.stringify({
        type: "client:join",
        playerName: "Observer",
        roomCode: code,
        guestId: "guest-observer",
      }),
    );
    const joined = await waitForMessage(observer, (m) => m.type === "server:room_joined");
    const characters = (joined.characters as Record<string, CharacterData> | undefined) ?? {};
    expect(characters.Player).toBeUndefined();

    host.close();
    observer.close();
  });

  it("disconnect (without kick) preserves the cache for reconnect", async () => {
    const host = await joinAs(code, "Host", { guestId: "guest-host" });
    host.send(JSON.stringify({ type: "client:set_character", character: fighter() }));
    await new Promise((r) => setTimeout(r, 40));
    host.close();
    await new Promise((r) => setTimeout(r, 100));

    // Someone else joins and still sees Host's cached character.
    const observer = await openWebSocket(code);
    observer.send(
      JSON.stringify({
        type: "client:join",
        playerName: "Observer",
        roomCode: code,
        guestId: "guest-observer",
      }),
    );
    const joined = await waitForMessage(observer, (m) => m.type === "server:room_joined");
    const characters = joined.characters as Record<string, CharacterData> | undefined;
    expect(characters?.Host).toBeDefined();
    observer.close();
  });
});
