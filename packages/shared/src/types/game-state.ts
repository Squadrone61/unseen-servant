// === Game State Types ===
// Phase 3: Structured game mechanics — dice, checks, combat, events.

import type { CharacterDynamicData } from "./character";

// ─── Dice ───

export type DieSize = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export interface DieRoll {
  die: DieSize;
  result: number;
}

export interface RollResult {
  id: string;
  rolls: DieRoll[];
  modifier: number;
  total: number;
  advantage?: boolean;
  disadvantage?: boolean;
  criticalHit?: boolean;
  criticalFail?: boolean;
  label: string;
}

// ─── Checks ───

export type CheckType = "ability" | "skill" | "saving_throw" | "attack" | "custom" | "damage";

export interface CheckRequest {
  id: string;
  type: CheckType;
  ability?: string;
  skill?: string;
  dc?: number;
  targetCharacter: string;
  advantage?: boolean;
  disadvantage?: boolean;
  reason: string;
  /** Dice notation for damage rolls, e.g. "2d6+3" */
  notation?: string;
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
  speed: number;
  movementUsed: number;
  position?: GridPosition;
  size: CreatureSize;
  tokenColor?: string;

  // Enemy/NPC only — players read these from CharacterDynamicData
  maxHP?: number;
  currentHP?: number;
  tempHP?: number;
  armorClass?: number;
  conditions?: ConditionEntry[];
  concentratingOn?: { spellName: string; since?: number };
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

export interface MapTile {
  type: TileType;
}

export interface BattleMapState {
  id: string;
  width: number;
  height: number;
  tiles: MapTile[][]; // [y][x]
  name?: string;
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
