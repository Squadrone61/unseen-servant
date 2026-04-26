/**
 * Test MCP server entrypoint — spawned by `claude -p` via the test scenario's
 * `.mcp.json`. Mirrors `apps/mcp-bridge/src/index.ts` but boots state from a
 * fixture JSON instead of a worker, captures every tool call to a JSONL file,
 * and shuts down after the first send_response/acknowledge so claude's print
 * mode doesn't hang on the conductor's wait_for_message loop.
 *
 * Env contract (set by the harness via .mcp.json):
 *   TEST_FIXTURE_PATH   — absolute path to the fixture JSON (FixtureState)
 *   TEST_LOG_PATH       — absolute path; we APPEND JSONL tool-call records
 *   TEST_BROADCAST_PATH — absolute path; we APPEND JSONL broadcast records
 *   TEST_CAMPAIGNS_DIR  — absolute path for CampaignManager scratch (already empty)
 */
import * as fs from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageQueue } from "../../../mcp-bridge/src/message-queue.js";
import { CampaignManager } from "../../../mcp-bridge/src/services/campaign-manager.js";
import { GameLogger } from "../../../mcp-bridge/src/services/game-logger.js";
import { registerGameTools } from "../../../mcp-bridge/src/tools/game-tools.js";
import { registerDndTools } from "../../../mcp-bridge/src/tools/dnd-tools.js";
import { registerSrdTools } from "../../../mcp-bridge/src/tools/srd-tools.js";
import { registerCampaignTools } from "../../../mcp-bridge/src/tools/campaign-tools.js";
import { MockWSClient } from "./mock-ws-client.js";
import type { FixtureState, ToolCallLog } from "./types.js";
import type { CharacterData, GameState } from "@unseen-servant/shared/types";

const fixturePath = process.env.TEST_FIXTURE_PATH;
const logPath = process.env.TEST_LOG_PATH;
const broadcastPath = process.env.TEST_BROADCAST_PATH;

if (!fixturePath || !logPath || !broadcastPath) {
  process.stderr.write(
    "[test-mcp-server] missing required env: TEST_FIXTURE_PATH / TEST_LOG_PATH / TEST_BROADCAST_PATH\n",
  );
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as FixtureState;

const messageQueue = new MessageQueue();
const campaignManager = new CampaignManager();
const gameLogger = new GameLogger(campaignManager);
const wsClient = new MockWSClient({ messageQueue, campaignManager, gameLogger });

// Seed GSM from fixture.
const gsm = wsClient.gameStateManager;
gsm.characters = fixture.characters as Record<string, CharacterData>;
gsm.storyStarted = fixture.storyStarted ?? true;
gsm.playerNames = fixture.playerNames ?? Object.keys(fixture.characters);
gsm.hostName = fixture.hostName ?? gsm.playerNames[0] ?? "DM";
if (fixture.gameState) {
  gsm.gameState = { ...gsm.gameState, ...(fixture.gameState as GameState) };
}

// Optionally create a campaign and pre-save encounter bundles. Lets scenarios
// exercise tools that require an active campaign (load_encounter_bundle,
// read_campaign_file, save_campaign_file …).
if (fixture.campaignName) {
  campaignManager.createCampaign(fixture.campaignName);
  for (const bundle of fixture.bundles ?? []) {
    campaignManager.saveEncounterBundle(bundle);
  }
} else if (fixture.bundles && fixture.bundles.length > 0) {
  process.stderr.write(
    "[test-mcp-server] fixture has bundles[] but no campaignName — bundles ignored\n",
  );
}

const toolLogStream = fs.createWriteStream(logPath, { flags: "a" });
const broadcastLogStream = fs.createWriteStream(broadcastPath, { flags: "a" });

let turnClosed = false;
let scheduledExit = false;

function recordToolCall(entry: ToolCallLog): void {
  toolLogStream.write(JSON.stringify(entry) + "\n");
}

function snapshotResult(result: unknown): string | undefined {
  if (result === undefined) return undefined;
  try {
    const s = JSON.stringify(result);
    return s.length > 2048 ? s.slice(0, 2048) + "…[truncated]" : s;
  } catch {
    return String(result).slice(0, 2048);
  }
}

function scheduleShutdown(reason: string): void {
  if (scheduledExit) return;
  scheduledExit = true;
  process.stderr.write(`[test-mcp-server] scheduling shutdown: ${reason}\n`);
  // 1.5s gives the MCP transport time to flush the last response back to claude.
  setTimeout(() => {
    toolLogStream.end();
    broadcastLogStream.end();
    process.exit(0);
  }, 1500);
}

/** Build the server with logging + turn-closed guard wired in. */
function buildInstrumentedServer(): McpServer {
  const server = new McpServer({ name: "test-bridge", version: "1.0.0" });

  type RegisterToolFn = (name: string, def: unknown, handler: unknown) => unknown;
  const original = server.registerTool.bind(server) as unknown as RegisterToolFn;

  (server as unknown as { registerTool: RegisterToolFn }).registerTool = (
    name: string,
    def: unknown,
    handler: unknown,
  ) => {
    const userHandler = handler as (...args: unknown[]) => Promise<unknown>;
    let inner = userHandler;
    if (name === "wait_for_message") {
      const orig = inner;
      inner = async (...args: unknown[]) => {
        if (turnClosed) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "TEST_COMPLETE: this turn is closed. The harness only runs one player turn. " +
                  "Output a one-line summary if you must, then exit.",
              },
            ],
            isError: true,
          };
        }
        return orig(...args);
      };
    }
    const wrapped = async (...args: unknown[]) => {
      const start = Date.now();
      let result: unknown;
      let error: string | undefined;
      try {
        result = await inner(...args);
        return result;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordToolCall({
          ts: new Date().toISOString(),
          tool: name,
          args: args[0],
          result: snapshotResult(result),
          error,
          durationMs: Date.now() - start,
        });
        if (!error && (name === "send_response" || name === "acknowledge")) {
          turnClosed = true;
          scheduleShutdown(`tool ${name} closed the turn`);
        }
      }
    };
    return original(name, def, wrapped);
  };

  return server;
}

const server = buildInstrumentedServer();
registerGameTools(server, messageQueue, wsClient, gameLogger);
registerDndTools(server, wsClient, gameLogger);
registerSrdTools(server, wsClient, gameLogger);
registerCampaignTools(server, campaignManager, wsClient, gameLogger);

// Stream broadcasts to disk as MockWSClient records them.
type PushFn = (...items: (typeof wsClient.broadcasts)[number][]) => number;
const origPush = wsClient.broadcasts.push.bind(wsClient.broadcasts) as PushFn;
wsClient.broadcasts.push = ((...items) => {
  for (const item of items) {
    broadcastLogStream.write(JSON.stringify(item) + "\n");
  }
  return origPush(...items);
}) as PushFn;

// Seed the message queue with the fixture's player message — emulates the worker
// relaying server:player_action. handlePlayerAction builds a proper dm_request.
const requestId = `test-${Date.now().toString(36)}`;
gsm.handlePlayerAction(
  fixture.playerMessage.playerName,
  {
    type: "client:chat",
    content: fixture.playerMessage.chat,
    playerName: fixture.playerMessage.playerName,
  },
  requestId,
  fixture.playerMessage.userId,
);

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(
  `[test-mcp-server] ready — fixture=${fixturePath} log=${logPath} broadcast=${broadcastPath}\n`,
);

// Hard ceiling: never let the bridge live past 90s even if claude misbehaves.
setTimeout(() => {
  process.stderr.write("[test-mcp-server] hard timeout (90s) — exiting\n");
  process.exit(2);
}, 90_000);
