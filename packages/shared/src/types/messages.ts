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

/** AoE placement payload attached to a player chat message. */
export interface PendingAoEPayload {
  shape: "sphere" | "cone" | "rectangle";
  origin: GridPosition;
  size?: number;
  direction?: number;
  endpoint?: GridPosition;
  /** Oriented rectangle length in feet along `direction`. */
  length?: number;
  /** Oriented rectangle width in feet across `direction`. */
  width?: number;
  /** If true, `origin` is a grid intersection (corner) rather than a tile center. Used by sphere/cube player placements. */
  cornerOrigin?: boolean;
  spellName?: string;
  concentration?: boolean;
  color?: string;
  label?: string;
  rectanglePreset?: "free" | "line" | "cube";
  /** When present, this commit moves an existing AoE instead of creating a new one. */
  targetAoeId?: string;
}

export interface ClientChatMessage {
  type: "client:chat";
  content: string;
  playerName: string;
  /** Optional AoE placement/move committed atomically with this chat message. */
  pendingAoE?: PendingAoEPayload;
}

export interface ClientDismissAoEMessage {
  type: "client:dismiss_aoe";
  aoeId: string;
}

export interface ClientJoinMessage {
  type: "client:join";
  playerName: string;
  roomCode: string;
  authToken?: string;
  guestId?: string;
  password?: string;
  isDM?: boolean;
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
  campaigns?: {
    slug: string;
    name: string;
    lastPlayedAt: string;
    sessionCount: number;
    pacingProfile?: string;
    encounterLength?: string;
    customPrompt?: string;
  }[];
}

/** Host-only: select or create a campaign */
export interface ClientSetCampaignMessage {
  type: "client:set_campaign";
  campaignSlug?: string;
  newCampaignName?: string;
}

/** Host-only: configure campaign settings before story starts */
export interface ClientConfigureCampaignMessage {
  type: "client:configure_campaign";
  campaignName: string;
  systemPrompt?: string;
  pacingProfile: PacingProfile;
  encounterLength: EncounterLength;
  existingCampaignSlug?: string;
}

/** DM Bridge → Server: campaign configured acknowledgement */
export interface ClientCampaignConfiguredAckMessage {
  type: "client:campaign_configured_ack";
  campaignSlug: string;
  campaignName: string;
  pacingProfile: PacingProfile;
  encounterLength: EncounterLength;
  systemPrompt?: string;
  restoredCharacters?: Record<string, CharacterData>;
  /** Mapping of playerName → userId for stable character matching across sessions */
  characterUserIds?: Record<string, string>;
}

/** DM Bridge → Server: campaign loaded confirmation */
export interface ClientCampaignLoadedMessage {
  type: "client:campaign_loaded";
  campaignSlug: string;
  campaignName: string;
  sessionCount: number;
}

/** DM Bridge → Server: story has started (replaces string-sniffing) */
export interface ClientStoryStartedMessage {
  type: "client:story_started";
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
  message?: string;
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

/** DM Bridge → Server: DM rolled dice (monster attacks, damage, etc.) */
export interface ClientDMDiceRollMessage {
  type: "client:dm_dice_roll";
  roll: RollResult;
  reason?: string;
}

/** DM Bridge → Server: DM requests a check from a player */
export interface ClientDMCheckRequestMessage {
  type: "client:dm_check_request";
  /** Flat check type string: "perception", "dexterity_save", "melee_attack", etc. */
  checkType?: string;
  targetCharacter: string;
  dc?: number;
  reason: string;
  /** Dice notation — always required, e.g. "1d20", "2d20kh1", "2d6+3" */
  notation: string;
}

/** DM Bridge → Server: computed check result after player rolled */
export interface ClientDMCheckResultMessage {
  type: "client:dm_check_result";
  checkRequestId: string;
  roll: RollResult;
  success?: boolean;
  characterName: string;
  dc?: number;
  playerName: string;
}

/** Host-only: permanently destroy the room and wipe all data */
export interface ClientEndTurnMessage {
  type: "client:end_turn";
}

export interface ClientDestroyRoomMessage {
  type: "client:destroy_room";
}

export interface ClientTypingMessage {
  type: "client:typing";
  isTyping: boolean;
}

/** Player saving personal notes (private, AI DM cannot read) */
export interface ClientSaveNotesMessage {
  type: "client:save_notes";
  content: string;
}

/** DM Bridge → Server: broadcast a ServerMessage payload to all (or targeted) players */
export interface ClientBroadcastMessage {
  type: "client:broadcast";
  payload: ServerMessage;
  targets?: string[];
}

/** DM Bridge → Server: acknowledge a player action (optional error feedback) */
export interface ClientActionResultMessage {
  type: "client:action_result";
  requestId: string;
  error?: string;
}

export type ClientMessage =
  | ClientChatMessage
  | ClientJoinMessage
  | ClientDMResponseMessage
  | ClientDMConfigMessage
  | ClientSetCampaignMessage
  | ClientCampaignLoadedMessage
  | ClientStoryStartedMessage
  | ClientConfigureCampaignMessage
  | ClientCampaignConfiguredAckMessage
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
  | ClientDestroyRoomMessage
  | ClientDMDiceRollMessage
  | ClientDMCheckRequestMessage
  | ClientDMCheckResultMessage
  | ClientBroadcastMessage
  | ClientActionResultMessage
  | ClientDismissAoEMessage
  | ClientTypingMessage
  | ClientSaveNotesMessage;

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
  id?: string;
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
  /** Whether campaign has been configured */
  campaignConfigured?: boolean;
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
  isDM?: boolean;
}

export interface ServerPlayerLeftMessage {
  type: "server:player_left";
  playerName: string;
  players: string[];
  hostName: string;
  allPlayers?: PlayerInfo[];
  isDM?: boolean;
}

export interface ServerCharacterUpdatedMessage {
  type: "server:character_updated";
  playerName: string;
  character: CharacterData;
  source?: "player" | "system";
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
  /** Links this roll to a check_request (for merging in chat UI) */
  checkRequestId?: string;
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
  /** All party characters — sent on join/reconnect so frontend can populate without worker cache */
  characters?: Record<string, CharacterData>;
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
  campaigns?: {
    slug: string;
    name: string;
    lastPlayedAt: string;
    sessionCount: number;
    pacingProfile?: string;
    encounterLength?: string;
    customPrompt?: string;
  }[];
}

/** Campaign loaded confirmation — Bridge → Worker → all clients */
export interface ServerCampaignLoadedMessage {
  type: "server:campaign_loaded";
  campaignSlug: string;
  campaignName: string;
  sessionCount: number;
}

/** Campaign configured — broadcast to all clients after bridge confirms */
export interface ServerCampaignConfiguredMessage {
  type: "server:campaign_configured";
  campaignName: string;
  campaignSlug: string;
  pacingProfile: PacingProfile;
  encounterLength: EncounterLength;
  systemPrompt?: string;
  restoredCharacters?: Record<string, CharacterData>;
}

/** Server → DM Bridge: forward character data for campaign persistence */
export interface ServerCharacterForCampaignMessage {
  type: "server:character_for_campaign";
  playerName: string;
  userId?: string;
  character: CharacterData;
}

/** Server → DM Bridge: forward player's "Roll" click for bridge to compute */
export interface ServerDMRollRequestMessage {
  type: "server:dm_roll_request";
  checkRequestId: string;
  playerName: string;
}

/** Server → DM Bridge: forward a player action for bridge to handle */
export interface ServerPlayerActionMessage {
  type: "server:player_action";
  playerName: string;
  userId?: string;
  action: ClientMessage;
  requestId: string;
}

/** Typing indicator — ephemeral, not persisted */
export interface ServerTypingMessage {
  type: "server:typing";
  playerName: string;
  isTyping: boolean;
}

/** Player's saved notes loaded from campaign (private, AI DM cannot read) */
export interface ServerPlayerNotesLoadedMessage {
  type: "server:player_notes_loaded";
  content: string;
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
  | ServerCampaignConfiguredMessage
  | ServerCharacterForCampaignMessage
  | ServerDMRollRequestMessage
  | ServerPlayerActionMessage
  | ServerRoomDestroyedMessage
  | ServerTypingMessage
  | ServerPlayerNotesLoadedMessage;
