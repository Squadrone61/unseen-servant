// === AI Action Types ===
// Structured actions the AI embeds in its response as fenced JSON blocks.
// The server parses, validates, and applies these via the state resolver.

import type { CheckType, CreatureSize, GridPosition, JournalNPC } from "./game-state";

// ─── Individual action types ───

export interface AICheckRequest {
  type: "check_request";
  check: {
    type: CheckType;
    ability?: string;
    skill?: string;
    dc?: number;
    targetCharacter: string;
    advantage?: boolean;
    disadvantage?: boolean;
    reason: string;
  };
}

export interface AIDamage {
  type: "damage";
  target: string;
  amount: number;
  damageType?: string;
  description?: string;
}

export interface AIHealing {
  type: "healing";
  target: string;
  amount: number;
}

export interface AISetHP {
  type: "set_hp";
  target: string;
  value: number;
}

export interface AISetTempHP {
  type: "set_temp_hp";
  target: string;
  value: number;
}

export interface AIConditionAdd {
  type: "condition_add";
  target: string;
  condition: string;
}

export interface AIConditionRemove {
  type: "condition_remove";
  target: string;
  condition: string;
}

export interface AISpellSlotUse {
  type: "spell_slot_use";
  target: string;
  level: number;
}

export interface AISpellSlotRestore {
  type: "spell_slot_restore";
  target: string;
  level: number;
}

export interface AICombatStart {
  type: "combat_start";
  enemies: Array<{
    name: string;
    maxHP: number;
    armorClass: number;
    initiativeModifier: number;
    speed: number;
    size?: CreatureSize;
    position?: GridPosition;
    tokenColor?: string;
  }>;
  mapLayout?: {
    width: number;
    height: number;
    /** Array of row strings: "." floor, "#" wall, "~" water, "^" difficult, "D" door */
    tiles: string[];
  };
  description?: string;
}

export interface AICombatEnd {
  type: "combat_end";
  description?: string;
}

export interface AITurnEnd {
  type: "turn_end";
}

export interface AIDeathSave {
  type: "death_save";
  target: string;
}

export interface AIXPAward {
  type: "xp_award";
  targets: string[];
  amount: number;
}

export interface AIAddCombatants {
  type: "add_combatants";
  combatants: Array<{
    name: string;
    type: "npc" | "enemy";
    maxHP: number;
    armorClass: number;
    initiativeModifier: number;
    speed: number;
    size?: CreatureSize;
    position?: GridPosition;
  }>;
}

export interface AIMoveCombatant {
  type: "move";
  combatantName: string;
  to: GridPosition;
}

export interface AIShortRest {
  type: "short_rest";
  targets?: string[];
}

export interface AILongRest {
  type: "long_rest";
  targets?: string[];
}

export interface AIJournalUpdate {
  type: "journal_update";
  storySummary?: string;
  activeQuest?: string;
  questCompleted?: string;
  addNPC?: JournalNPC;
  removeNPC?: string;
  addLocation?: string;
  addItem?: string;
  removeItem?: string;
}

// ─── Union type ───

export type AIAction =
  | AICheckRequest
  | AIDamage
  | AIHealing
  | AISetHP
  | AISetTempHP
  | AIConditionAdd
  | AIConditionRemove
  | AISpellSlotUse
  | AISpellSlotRestore
  | AICombatStart
  | AICombatEnd
  | AITurnEnd
  | AIDeathSave
  | AIXPAward
  | AIAddCombatants
  | AIMoveCombatant
  | AIShortRest
  | AILongRest
  | AIJournalUpdate;

// ─── Wrapper the AI produces ───

export interface AIActionBlock {
  actions: AIAction[];
}
