// === Game State Types ===
// Phase 3: Structured game mechanics — dice, checks, combat, events.

import type { CharacterDynamicData, CharacterSpeed } from "./character";
import type { EffectBundle } from "./effects";

// ─── Dice ───

export type DieSize = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export interface DieRoll {
  die: DieSize;
  result: number;
  /** True if this die was discarded by kl/dl/dh notation (e.g. 4d6dl1 or 2d20kl1) */
  dropped?: boolean;
}

export interface RollResult {
  id: string;
  rolls: DieRoll[];
  modifier: number;
  total: number;
  criticalHit?: boolean;
  criticalFail?: boolean;
  label: string;
  /** Original notation string used to produce this roll, e.g. "2d20kh1+5" */
  notation?: string;
}

// ─── Checks ───

export interface CheckRequest {
  id: string;
  /** Flat check type string: "perception", "dexterity_save", "melee_attack", etc.
   *  Undefined for pure notation rolls with no auto-modifier lookup. */
  checkType?: string;
  dc?: number;
  targetCharacter: string;
  reason: string;
  /** Dice notation — always required, e.g. "1d20", "2d20kh1", "2d6+3" */
  notation: string;
  /** When true, this check was initiated by the DM bridge (not parsed from AI text) */
  dmInitiated?: boolean;
}

export interface CheckResult {
  requestId: string;
  roll: RollResult;
  dc?: number;
  success?: boolean;
  characterName: string;
}

// ─── Grid ───

export interface GridPosition {
  x: number;
  y: number;
}

export type CreatureSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

// ─── Conditions ───

export interface ConditionEntry {
  name: string;
  duration?: number;
  startRound?: number;
  /** If true, this condition is cleared when the character completes a long rest */
  endsOnLongRest?: boolean;
  /**
   * When the duration countdown fires relative to the afflicted creature's turn.
   * "end-of-turn" (default): countdown happens at the end of that creature's turn.
   * "start-of-turn": the condition expires at the start of that creature's turn
   *   (e.g. Paralyzed from Hold Person — the target repeats the save at start of turn).
   */
  expiresAt?: "start-of-turn" | "end-of-turn";
}

// ─── Combatant ───
// Player combatants bind to CharacterDynamicData — HP, conditions, etc. are
// read/written via the character entry. Only enemy/npc combatants carry
// their own HP and conditions.

export interface Combatant {
  id: string;
  name: string;
  type: "player" | "npc" | "enemy";
  /** userId for player-type combatants (HP/conditions come from CharacterDynamicData) */
  playerId?: string;
  initiative: number;
  initiativeModifier: number;
  /** DEX score used as initiative tiebreaker (higher goes first). */
  dexScore: number;
  speed: CharacterSpeed;
  movementUsed: number;
  position?: GridPosition;
  size: CreatureSize;
  tokenColor?: string;

  /**
   * True during the first round of combat if this combatant was surprised.
   * Surprised creatures cannot act, react, or move on their first turn.
   * Cleared automatically when advanceTurn passes their first turn.
   */
  surprised?: boolean;

  /**
   * Whether this combatant has used their reaction this round.
   * Reset at the start of their next turn.
   */
  reactionUsed?: boolean;

  /**
   * Whether this combatant has used their bonus action this turn.
   * Reset at the start of their next turn.
   */
  bonusActionUsed?: boolean;

  // Enemy/NPC only — players read these from CharacterDynamicData
  maxHP?: number;
  currentHP?: number;
  tempHP?: number;
  armorClass?: number;
  conditions?: ConditionEntry[];
  concentratingOn?: { spellName: string; since?: number };
  /** Runtime effect bundles from conditions, spells, etc. */
  activeEffects?: EffectBundle[];
  /**
   * Optional per-ability saving throw bonuses for NPC/enemy combatants.
   * Keys are lowercase ability names (e.g. "dexterity", "wisdom").
   * The AI DM populates this from lookup_monster data when adding combatants.
   */
  saveBonuses?: Record<string, number>;
}

// ─── Combat ───

export type CombatPhase = "initiative" | "active" | "ended";

export interface CombatState {
  phase: CombatPhase;
  round: number;
  turnIndex: number;
  turnOrder: string[]; // combatant IDs sorted by initiative
  combatants: Record<string, Combatant>;
  pendingCheck?: CheckRequest;
  activeAoE?: AoEOverlay[];
}

// ─── Encounter ───

export type EncounterPhase = "exploration" | "combat" | "social" | "rest";

export interface EncounterState {
  id: string;
  phase: EncounterPhase;
  combat?: CombatState;
  map?: BattleMapState;
}

// ─── Battle Map ───

export type TileType = "floor" | "wall" | "difficult_terrain" | "water" | "pit" | "door" | "stairs";

export type TileObjectCategory = "furniture" | "container" | "hazard" | "interactable" | "weapon";

export interface TileObject {
  name: string;
  category: TileObjectCategory;
  destructible?: boolean;
  hp?: number;
  height?: number; // object height in feet
  description?: string;
}

export interface MapTile {
  type: TileType;
  object?: TileObject;
  elevation?: number; // height in feet (0 = ground, 10 = ledge, -10 = pit)
  cover?: "half" | "three-quarters" | "full";
  label?: string; // short label for hover
}

export interface BattleMapState {
  id: string;
  width: number;
  height: number;
  tiles: MapTile[][]; // [y][x]
  name?: string;
}

// ─── AoE Overlays ───

export interface AoEOverlay {
  id: string;
  shape: "sphere" | "cone" | "rectangle";
  /** Origin point — used by sphere (center) and cone (caster position). For rectangle, the midpoint of from/to can be derived when needed. */
  center: GridPosition;
  /** Radius in feet (sphere) or length in feet (cone). */
  size?: number;
  /** Direction in degrees, 0=north, 90=east — cone only. */
  direction?: number;
  /** Starting corner of the rectangle — legacy axis-aligned rectangles only. */
  from?: GridPosition;
  /** Opposite corner of the rectangle — legacy axis-aligned rectangles only. */
  to?: GridPosition;
  /** Rectangle length in feet along `direction` (oriented rectangle). */
  length?: number;
  /** Rectangle width in feet across `direction` (oriented rectangle). */
  width?: number;
  /** If true, `center` is a grid intersection (corner) rather than a tile position. */
  cornerOrigin?: boolean;
  color: string; // direct RGB hex
  label: string; // "Fireball", "Wall of Fire"
  persistent: boolean; // stays on map until dismissed?
  casterName?: string;
  /** Player userId or "DM" — who owns this overlay and can move/dismiss it. */
  ownerId?: string;
  /** Display name of the owner. */
  ownerName?: string;
  /** Rectangle preset hint: geometry is stored as from/to, this tells the UI which editor to show. */
  rectanglePreset?: "free" | "line" | "cube";
}

// ─── State Changes (atomic operations) ───

export type StateChange =
  | { type: "damage"; target: string; amount: number; damageType?: string }
  | { type: "healing"; target: string; amount: number }
  | { type: "temp_hp"; target: string; amount: number }
  | { type: "hp_set"; target: string; value: number }
  | { type: "condition_add"; target: string; condition: string }
  | { type: "condition_remove"; target: string; condition: string }
  | { type: "spell_slot_use"; target: string; level: number }
  | { type: "spell_slot_restore"; target: string; level: number }
  | { type: "resource_use"; target: string; resource: string }
  | { type: "resource_restore"; target: string; resource: string; amount: number }
  | { type: "death_save"; target: string; success: boolean }
  | { type: "item_add"; target: string; item: string; quantity: number }
  | { type: "item_remove"; target: string; item: string; quantity: number }
  | { type: "item_update"; target: string; item: string; changes: string }
  | { type: "combatant_add"; combatant: Combatant }
  | { type: "combatant_remove"; combatantId: string }
  | { type: "initiative_set"; combatantId: string; value: number }
  | { type: "move"; combatantId: string; from: GridPosition; to: GridPosition }
  | { type: "combat_phase"; phase: CombatPhase }
  | { type: "encounter_phase"; phase: EncounterPhase };

// ─── Event Log (for rollback) ───

export type GameEventType =
  | "damage"
  | "healing"
  | "condition_added"
  | "condition_removed"
  | "spell_slot_used"
  | "spell_slot_restored"
  | "resource_used"
  | "resource_restored"
  | "hp_set"
  | "temp_hp_set"
  | "death_save"
  | "combat_start"
  | "combat_end"
  | "turn_start"
  | "turn_end"
  | "check_requested"
  | "check_resolved"
  | "initiative_rolled"
  | "rest_short"
  | "rest_long"
  | "item_added"
  | "item_removed"
  | "item_updated"
  | "inspiration_granted"
  | "inspiration_used"
  | "ai_response"
  | "custom";

export interface GameEvent {
  id: string;
  type: GameEventType;
  timestamp: number;
  description: string;
  /** Snapshot of all CharacterDynamicData + enemy combatant HP before this event */
  stateBefore: {
    characters: Record<string, CharacterDynamicData>;
    combatants?: Record<string, Combatant>;
    /** Encounter phase snapshot (exploration, combat, social, rest) */
    encounterPhase?: EncounterPhase;
    /** Pending check snapshot (exploration-phase checks) */
    pendingCheck?: CheckRequest;
    /** Battle map snapshot */
    map?: BattleMapState;
  };
  /** Conversation history length at this point (for AI rollback) */
  conversationIndex: number;
  /** The atomic changes applied */
  changes: StateChange[];
}

// ─── Pacing ───

export type PacingProfile = "story-heavy" | "balanced" | "combat-heavy";
export type EncounterLength = "quick" | "standard" | "epic";

// ─── Campaign Journal ───

export interface JournalNPC {
  name: string;
  /** e.g. "quest giver", "merchant", "antagonist" */
  role: string;
  /** e.g. "friendly", "hostile", "neutral" */
  disposition: string;
  /** Last known location, e.g. "Oakfield tavern" */
  lastSeen?: string;
}

export interface CampaignJournal {
  /** 1-3 sentence summary of story so far */
  storySummary: string;
  /** Current objective */
  activeQuest?: string;
  /** Short labels of completed quests */
  completedQuests: string[];
  /** Key NPCs the party has met (max 10) */
  npcs: JournalNPC[];
  /** Visited location names (max 8) */
  locations: string[];
  /** Important loot/artifacts (max 8) */
  notableItems: string[];
  /** Party level for quick reference */
  partyLevel: number;
}

// ─── Session-Level Game State ───

export interface GameState {
  encounter: EncounterState | null;
  eventLog: GameEvent[];
  pacingProfile: PacingProfile;
  encounterLength: EncounterLength;
  customSystemPrompt?: string;
  /** Check pending outside of combat (exploration phase) */
  pendingCheck?: CheckRequest;
  /** Compact campaign journal maintained by AI for story continuity */
  journal?: CampaignJournal;
}
