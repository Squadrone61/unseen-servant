import { GameRoom } from "./durable-objects/game-room";
import { getGoogleAuthURL, handleGoogleCallback } from "./auth/google";
import { verifyJWT } from "./auth/jwt";
import type { Env, RoomMeta } from "./types";

export { GameRoom };

function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = getCorsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // --- Auth routes ---

    // GET /api/auth/google — redirect to Google OAuth consent screen
    if (url.pathname === "/api/auth/google" && request.method === "GET") {
      const authUrl = getGoogleAuthURL(env, request);
      return Response.redirect(authUrl, 302);
    }

    // GET /api/auth/google/callback — handle OAuth callback
    if (
      url.pathname === "/api/auth/google/callback" &&
      request.method === "GET"
    ) {
      return handleGoogleCallback(request, env);
    }

    // GET /api/auth/me — verify JWT and return user info
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "No token provided" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      const token = authHeader.slice(7);
      const payload = await verifyJWT(token, env.JWT_SECRET);
      if (!payload) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      return new Response(
        JSON.stringify({
          userId: payload.sub,
          displayName: payload.name,
          email: payload.email,
          avatarUrl: payload.picture,
        }),
        { headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    // --- Room routes ---

    // POST /api/rooms/create — generate a new room code
    if (url.pathname === "/api/rooms/create" && request.method === "POST") {
      const roomCode = generateRoomCode();

      // Initialize the Durable Object so it knows it was explicitly created
      const roomId = env.GAME_ROOM.idFromName(roomCode);
      const room = env.GAME_ROOM.get(roomId);
      await room.fetch(new Request("https://internal/init", { method: "POST" }));

      // Register room in KV for the room list
      const meta: RoomMeta = {
        roomCode,
        hostName: "",
        playerCount: 0,
        hasPassword: false,
        createdAt: Date.now(),
      };
      await env.ROOMS.put(`room:${roomCode}`, JSON.stringify(meta), {
        expirationTtl: 86400 * 7,
      });

      return new Response(JSON.stringify({ roomCode }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // GET /api/rooms — list all active rooms
    if (url.pathname === "/api/rooms" && request.method === "GET") {
      const list = await env.ROOMS.list({ prefix: "room:" });
      const rooms: RoomMeta[] = [];
      for (const key of list.keys) {
        const val = await env.ROOMS.get(key.name);
        if (val) {
          try {
            const meta = JSON.parse(val);
            if (meta.playerCount > 0) {
              rooms.push(meta);
            }
          } catch {
            // skip malformed entries
          }
        }
      }
      return new Response(JSON.stringify({ rooms }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // GET /api/rooms/:code/ws — WebSocket upgrade into a game room
    const wsMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/ws$/);
    if (wsMatch) {
      const roomCode = wsMatch[1];
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const roomId = env.GAME_ROOM.idFromName(roomCode);
      const room = env.GAME_ROOM.get(roomId);
      return room.fetch(request);
    }

    // GET /api/health
    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({ status: "ok", timestamp: Date.now() }),
        { headers: { "Content-Type": "application/json", ...cors } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
