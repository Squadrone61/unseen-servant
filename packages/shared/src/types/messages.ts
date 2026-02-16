// === Auth ===

export interface AuthUser {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

// === AI Configuration ===

export interface AIConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

// === Client → Server messages ===

export interface ClientChatMessage {
  type: "client:chat";
  content: string;
  playerName: string;
}

export interface ClientJoinMessage {
  type: "client:join";
  playerName: string;
  roomCode: string;
  aiConfig?: AIConfig;
  authToken?: string;
  guestId?: string;
  /** @deprecated Use aiConfig instead */
  apiKey?: string;
}

export interface ClientSetAIConfigMessage {
  type: "client:set_ai_config";
  aiConfig: AIConfig;
}

export interface ClientApproveJoinMessage {
  type: "client:approve_join";
  playerName: string;
}

export interface ClientRejectJoinMessage {
  type: "client:reject_join";
  playerName: string;
}

export interface ClientKickPlayerMessage {
  type: "client:kick_player";
  playerName: string;
}

export type ClientMessage =
  | ClientChatMessage
  | ClientJoinMessage
  | ClientSetAIConfigMessage
  | ClientApproveJoinMessage
  | ClientRejectJoinMessage
  | ClientKickPlayerMessage;

// === Server → Client messages ===

export interface ServerChatMessage {
  type: "server:chat";
  content: string;
  playerName: string;
  timestamp: number;
  id: string;
}

export interface ServerAIMessage {
  type: "server:ai";
  content: string;
  timestamp: number;
  id: string;
}

export interface ServerSystemMessage {
  type: "server:system";
  content: string;
  timestamp: number;
}

export interface ServerRoomJoinedMessage {
  type: "server:room_joined";
  roomCode: string;
  players: string[];
  hostName: string;
  hasApiKey: boolean;
  aiProvider?: string;
  aiModel?: string;
  isHost?: boolean;
  isReconnect?: boolean;
  user?: AuthUser;
}

export interface ServerPlayerJoinedMessage {
  type: "server:player_joined";
  playerName: string;
  players: string[];
  hostName: string;
}

export interface ServerPlayerLeftMessage {
  type: "server:player_left";
  playerName: string;
  players: string[];
  hostName: string;
}

export interface ServerErrorMessage {
  type: "server:error";
  message: string;
  code: string;
}

export interface ServerJoinPendingMessage {
  type: "server:join_pending";
  roomCode: string;
  position?: number;
}

export interface ServerJoinRequestMessage {
  type: "server:join_request";
  playerName: string;
  avatarUrl?: string;
}

export interface ServerKickedMessage {
  type: "server:kicked";
  reason: string;
}

export type ServerMessage =
  | ServerChatMessage
  | ServerAIMessage
  | ServerSystemMessage
  | ServerRoomJoinedMessage
  | ServerPlayerJoinedMessage
  | ServerPlayerLeftMessage
  | ServerErrorMessage
  | ServerJoinPendingMessage
  | ServerJoinRequestMessage
  | ServerKickedMessage;
