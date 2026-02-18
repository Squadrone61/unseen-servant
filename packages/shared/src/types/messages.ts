// === Auth ===

export interface AuthUser {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

// Re-export types for convenience
import type { CharacterData, PlayerInfo } from "./character";
import type { AIAction } from "./ai-actions";
import type {
  CheckRequest,
  CheckResult,
  CombatState,
  GameEvent,
  GameState,
  GridPosition,
  PacingProfile,
  EncounterLength,
  RollResult,
  StateChange,
} from "./game-state";
export type { CharacterData, PlayerInfo };

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

export interface ClientSetCharacterMessage {
  type: "client:set_character";
  character: CharacterData;
}

export interface ClientStartStoryMessage {
  type: "client:start_story";
}

export interface ClientRollDiceMessage {
  type: "client:roll_dice";
  checkRequestId: string;
}

export interface ClientCombatActionMessage {
  type: "client:combat_action";
  action: string;
}

export interface ClientMoveTokenMessage {
  type: "client:move_token";
  to: GridPosition;
}

export interface ClientRollbackMessage {
  type: "client:rollback";
  eventId: string;
}

/** Host-only: set custom system prompt (undefined = reset to default) */
export interface ClientSetSystemPromptMessage {
  type: "client:set_system_prompt";
  prompt?: string;
}

/** Host-only: set pacing profile and encounter length */
export interface ClientSetPacingMessage {
  type: "client:set_pacing";
  profile: PacingProfile;
  encounterLength: EncounterLength;
}

/** Host-only: manually adjust character dynamic state */
export interface ClientDMOverrideMessage {
  type: "client:dm_override";
  characterName: string;
  changes: StateChange[];
}

/** Host-only: permanently destroy the room and wipe all data */
export interface ClientDestroyRoomMessage {
  type: "client:destroy_room";
}

export type ClientMessage =
  | ClientChatMessage
  | ClientJoinMessage
  | ClientSetAIConfigMessage
  | ClientApproveJoinMessage
  | ClientRejectJoinMessage
  | ClientKickPlayerMessage
  | ClientSetCharacterMessage
  | ClientStartStoryMessage
  | ClientRollDiceMessage
  | ClientCombatActionMessage
  | ClientMoveTokenMessage
  | ClientRollbackMessage
  | ClientSetSystemPromptMessage
  | ClientSetPacingMessage
  | ClientDMOverrideMessage
  | ClientDestroyRoomMessage;

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
  /** Structured game actions parsed from the AI response */
  actions?: AIAction[];
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
  characters?: Record<string, CharacterData>;
  allPlayers?: PlayerInfo[];
  storyStarted?: boolean;
}

export interface ServerPlayerJoinedMessage {
  type: "server:player_joined";
  playerName: string;
  players: string[];
  hostName: string;
  allPlayers?: PlayerInfo[];
}

export interface ServerPlayerLeftMessage {
  type: "server:player_left";
  playerName: string;
  players: string[];
  hostName: string;
  allPlayers?: PlayerInfo[];
}

export interface ServerCharacterUpdatedMessage {
  type: "server:character_updated";
  playerName: string;
  character: CharacterData;
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

/** A check has been requested — shows "Roll" button to the target player */
export interface ServerCheckRequestMessage {
  type: "server:check_request";
  check: CheckRequest;
  timestamp: number;
  id: string;
}

/** A check has been resolved — shows result to all */
export interface ServerCheckResultMessage {
  type: "server:check_result";
  result: CheckResult;
  timestamp: number;
  id: string;
}

/** Dice roll visual — appears inline in chat */
export interface ServerDiceRollMessage {
  type: "server:dice_roll";
  roll: RollResult;
  playerName: string;
  timestamp: number;
  id: string;
}

/** Combat state changed */
export interface ServerCombatUpdateMessage {
  type: "server:combat_update";
  combat: CombatState | null;
  timestamp: number;
}

/** Full game state sync (on join/reconnect) */
export interface ServerGameStateSyncMessage {
  type: "server:game_state_sync";
  gameState: GameState;
}

/** Rollback completed */
export interface ServerRollbackMessage {
  type: "server:rollback";
  toEventId: string;
  gameState: GameState;
  characterUpdates: Record<string, CharacterData>;
  timestamp: number;
}

/** Event log entry broadcast (for host rollback UI) */
export interface ServerEventLogMessage {
  type: "server:event_log";
  event: GameEvent;
}

/** Broadcast when host destroys the room — all clients should disconnect */
export interface ServerRoomDestroyedMessage {
  type: "server:room_destroyed";
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
  | ServerKickedMessage
  | ServerCharacterUpdatedMessage
  | ServerCheckRequestMessage
  | ServerCheckResultMessage
  | ServerDiceRollMessage
  | ServerCombatUpdateMessage
  | ServerGameStateSyncMessage
  | ServerRollbackMessage
  | ServerEventLogMessage
  | ServerRoomDestroyedMessage;
