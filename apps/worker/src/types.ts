import type { GameRoom } from "./durable-objects/game-room";

export interface RoomMeta {
  roomCode: string;
  hostName: string;
  playerCount: number;
  hasPassword: boolean;
  createdAt: number;
}

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ROOMS: KVNamespace;
  ENVIRONMENT: string;

  // Auth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
}

export type { GameRoom };
