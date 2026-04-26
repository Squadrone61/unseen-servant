// === Encounter Bundle ===
// Persistent artifact written by encounter-designer (the specialist) once at
// /combat-prep time, then read once per turn by combat-resolver. Eliminates
// redundant per-turn lookup_rule churn for monster stats + abilities.

import type { CharacterSpeed } from "./character";

export type EncounterDifficulty = "low" | "moderate" | "high" | "deadly";

export type BundleAbilityKind = "attack" | "spell" | "trait" | "reaction" | "lair";

export interface BundleAbility {
  /** Human-readable label, e.g. "Multiattack", "Fire Breath", "Poison Spray". */
  name: string;
  /** Reference into the DB's ActionEffect for action_ref-driven mutations. Optional — some abilities (lair actions, narrative-only traits) don't have one. */
  actionRef?: string;
  kind: BundleAbilityKind;
  /** 1-2 line summary the resolver narrates from. Pre-resolved at design time. */
  summary: string;
  /** Trigger condition for reactions, e.g. "when target moves out of reach". */
  trigger?: string;
  /** Usage limits if any: per-round, per-encounter, or recharge dice. */
  uses?: {
    perRound?: number;
    perEncounter?: number;
    /** e.g. "5-6" for "Recharge 5-6". */
    recharge?: string;
  };
}

export interface BundleCombatant {
  /** Unique label within this encounter, e.g. "Grixx" or "Goblin 1". Matches the combatant's name in CombatState.combatants. */
  name: string;
  /** DB slug for the source monster, e.g. "goblin-boss". */
  monsterRef: string;
  hp: number;
  ac: number;
  speed: CharacterSpeed;
  /** Monster Intelligence score — drives the resolver's tactic-selection branch (1-5 animalistic, 6-9 basic, 10+ tactical). */
  intelligence: number;
  /** Designer-provided one-liner on this combatant's combat priorities, e.g. "hangs back, casts Web on cluster, melee fall-back". */
  tacticsNote?: string;
  abilities: BundleAbility[];
}

export interface BundleOpeningPosition {
  /** Combatant name, must match a BundleCombatant.name. */
  name: string;
  /** A1 grid coordinate, e.g. "D5". */
  pos: string;
}

export interface EncounterBundle {
  /** kebab-case identifier, e.g. "goblin-ambush-river-2026-04-26". */
  slug: string;
  /** Manifest sessionCount when this bundle was created. */
  createdSession: number;
  /** ISO timestamp. */
  createdAt: string;
  difficulty: EncounterDifficulty;
  /** Snapshot of the party at design time — used to validate difficulty if levels later differ. */
  partySnapshot: { name: string; level: number }[];
  combatants: BundleCombatant[];
  /** Reference to the live battle map by name. Bundle does NOT duplicate the tile list — combat-resolver reads tiles via get_map_info. */
  mapName: string;
  openingPositions: BundleOpeningPosition[];
  tacticsHint?: string;
  /** SRD citations the designer used, kept for the resolver's CITATIONS section. */
  citations: string[];
}
