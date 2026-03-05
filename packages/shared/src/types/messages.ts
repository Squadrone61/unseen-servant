// === Auth ===

export interface AuthUser {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

// Re-export types for convenience
import type { CharacterData, PlayerInfo } from "./character";
import type {
  BattleMapState,
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

// === DM Bridge Configuration (flows through WebSocket) ===

export interface DMBridgeConfig {
  provider: string;
  supportsTools: boolean;
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
  authToken?: string;
  guestId?: string;
  password?: string;
}

/** DM Bridge → Server: AI response for a dm_request */
export interface ClientDMResponseMessage {
  type: "client:dm_response";
  requestId: string;
  text: string;
  error?: string;
}

/** DM Bridge → Server: DM provider config changed */
export interface ClientDMConfigMessage {
  type: "client:dm_config";
  provider: string;
  supportsTools: boolean;
  campaigns?: { slug: string; name: string; lastPlayedAt: string; sessionCount: number }[];
}

/** Host-only: select or create a campaign */
export interface ClientSetCampaignMessage {
  type: "client:set_campaign";
  campaignSlug?: string;
  newCampaignName?: string;
}

/** DM Bridge → Server: campaign loaded confirmation */
export interface ClientCampaignLoadedMessage {
  type: "client:campaign_loaded";
  campaignSlug: string;
  campaignName: string;
  sessionCount: number;
}

export interface ClientSetPasswordMessage {
  type: "client:set_password";
  password: string;
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
export interface ClientEndTurnMessage {
  type: "client:end_turn";
}

export interface ClientDestroyRoomMessage {
  type: "client:destroy_room";
}

export type ClientMessage =
  | ClientChatMessage
  | ClientJoinMessage
  | ClientDMResponseMessage
  | ClientDMConfigMessage
  | ClientSetCampaignMessage
  | ClientCampaignLoadedMessage
  | ClientSetPasswordMessage
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
  | ClientEndTurnMessage
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
  isHost?: boolean;
  isReconnect?: boolean;
  user?: AuthUser;
  characters?: Record<string, CharacterData>;
  allPlayers?: PlayerInfo[];
  storyStarted?: boolean;
  /** Whether a DM bridge has connected */
  dmConnected: boolean;
  /** Active campaign info (if one is loaded) */
  activeCampaignSlug?: string;
  activeCampaignName?: string;
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
  map?: BattleMapState | null;
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

/** Server → DM Bridge: request to make an AI call */
export interface ServerDMRequestMessage {
  type: "server:dm_request";
  requestId: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

/** DM config update — forwarded to all clients when bridge connects/updates */
export interface ServerDMConfigUpdateMessage {
  type: "server:dm_config_update";
  provider: string;
  supportsTools: boolean;
  campaigns?: { slug: string; name: string; lastPlayedAt: string; sessionCount: number }[];
}

/** Campaign loaded confirmation — Bridge → Worker → all clients */
export interface ServerCampaignLoadedMessage {
  type: "server:campaign_loaded";
  campaignSlug: string;
  campaignName: string;
  sessionCount: number;
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
  | ServerKickedMessage
  | ServerCharacterUpdatedMessage
  | ServerCheckRequestMessage
  | ServerCheckResultMessage
  | ServerDiceRollMessage
  | ServerCombatUpdateMessage
  | ServerGameStateSyncMessage
  | ServerRollbackMessage
  | ServerEventLogMessage
  | ServerDMRequestMessage
  | ServerDMConfigUpdateMessage
  | ServerCampaignLoadedMessage
  | ServerRoomDestroyedMessage;
