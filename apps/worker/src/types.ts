import type { GameRoom } from "./durable-objects/game-room";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ENVIRONMENT: string;

  // Auth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;

  // Optional: used to construct worker callback URL in production
  CF_ACCOUNT_SUBDOMAIN?: string;
}

export type { GameRoom };
