import { z } from "zod";

// ─── Dice schemas ───

export const dieSizeSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
  z.literal(20),
  z.literal(100),
]);

export const dieRollSchema = z.object({
  die: dieSizeSchema,
  result: z.number().int().positive(),
});

export const rollResultSchema = z.object({
  id: z.string(),
  rolls: z.array(dieRollSchema),
  modifier: z.number(),
  total: z.number(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  criticalHit: z.boolean().optional(),
  criticalFail: z.boolean().optional(),
  label: z.string(),
});

// ─── Check schemas ───

export const checkTypeSchema = z.enum([
  "ability",
  "skill",
  "saving_throw",
  "attack",
  "custom",
  "damage",
]);

export const checkRequestSchema = z.object({
  id: z.string(),
  type: checkTypeSchema,
  ability: z.string().optional(),
  skill: z.string().optional(),
  dc: z.number().optional(),
  targetCharacter: z.string(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  reason: z.string(),
  notation: z.string().optional(),
  attackType: z.enum(["melee", "ranged", "spell"]).optional(),
  dmInitiated: z.boolean().optional(),
});

export const checkResultSchema = z.object({
  requestId: z.string(),
  roll: rollResultSchema,
  dc: z.number().optional(),
  success: z.boolean().optional(),
  characterName: z.string(),
});

// ─── Grid ───

export const gridPositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

export const creatureSizeSchema = z.enum([
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
]);

// ─── Conditions ───

export const conditionEntrySchema = z.object({
  name: z.string(),
  duration: z.number().optional(),
  startRound: z.number().optional(),
  endsOnLongRest: z.boolean().optional(),
  expiresAt: z.enum(["start-of-turn", "end-of-turn"]).optional(),
});

// ─── Combatant ───

export const combatantSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["player", "npc", "enemy"]),
  playerId: z.string().optional(),
  initiative: z.number(),
  initiativeModifier: z.number(),
  speed: z.number(),
  movementUsed: z.number(),
  position: gridPositionSchema.optional(),
  size: creatureSizeSchema,
  tokenColor: z.string().optional(),
  surprised: z.boolean().optional(),
  reactionUsed: z.boolean().optional(),
  bonusActionUsed: z.boolean().optional(),
  // Enemy/NPC only fields
  maxHP: z.number().optional(),
  currentHP: z.number().optional(),
  tempHP: z.number().optional(),
  armorClass: z.number().optional(),
  conditions: z.array(conditionEntrySchema).optional(),
  concentratingOn: z.object({ spellName: z.string(), since: z.number().optional() }).optional(),
  saveBonuses: z.record(z.string(), z.number()).optional(),
});

// ─── Battle Map ───

export const tileTypeSchema = z.enum([
  "floor",
  "wall",
  "difficult_terrain",
  "water",
  "pit",
  "door",
  "stairs",
]);

export const tileObjectCategorySchema = z.enum([
  "furniture",
  "container",
  "hazard",
  "interactable",
  "weapon",
]);

export const tileObjectSchema = z.object({
  name: z.string(),
  category: tileObjectCategorySchema,
  destructible: z.boolean().optional(),
  hp: z.number().optional(),
  height: z.number().optional(),
  description: z.string().optional(),
});

export const mapTileSchema = z.object({
  type: tileTypeSchema,
  object: tileObjectSchema.optional(),
  elevation: z.number().optional(),
  cover: z.enum(["half", "three-quarters", "full"]).optional(),
  label: z.string().optional(),
});

export const aoeOverlaySchema = z.object({
  id: z.string(),
  shape: z.enum(["sphere", "cone", "line", "cube"]),
  center: gridPositionSchema,
  radius: z.number().optional(),
  length: z.number().optional(),
  width: z.number().optional(),
  direction: z.number().optional(),
  color: z.string(),
  label: z.string(),
  persistent: z.boolean(),
  casterName: z.string().optional(),
});

export const battleMapStateSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tiles: z.array(z.array(mapTileSchema)),
  name: z.string().optional(),
});

// ─── Combat ───

export const combatPhaseSchema = z.enum(["initiative", "active", "ended"]);

export const combatStateSchema = z.object({
  phase: combatPhaseSchema,
  round: z.number().int().positive(),
  turnIndex: z.number().int().min(0),
  turnOrder: z.array(z.string()),
  combatants: z.record(z.string(), combatantSchema),
  pendingCheck: checkRequestSchema.optional(),
  activeAoE: z.array(aoeOverlaySchema).optional(),
});

// ─── Encounter ───

export const encounterPhaseSchema = z.enum(["exploration", "combat", "social", "rest"]);

export const encounterStateSchema = z.object({
  id: z.string(),
  phase: encounterPhaseSchema,
  combat: combatStateSchema.optional(),
  map: battleMapStateSchema.optional(),
});

// ─── Pacing ───

export const pacingProfileSchema = z.enum(["story-heavy", "balanced", "combat-heavy"]);

export const encounterLengthSchema = z.enum(["quick", "standard", "epic"]);

// ─── State Changes ───

export const stateChangeSchema = z.union([
  z.object({
    type: z.literal("damage"),
    target: z.string(),
    amount: z.number(),
    damageType: z.string().optional(),
  }),
  z.object({ type: z.literal("healing"), target: z.string(), amount: z.number() }),
  z.object({ type: z.literal("temp_hp"), target: z.string(), amount: z.number() }),
  z.object({ type: z.literal("hp_set"), target: z.string(), value: z.number() }),
  z.object({ type: z.literal("condition_add"), target: z.string(), condition: z.string() }),
  z.object({ type: z.literal("condition_remove"), target: z.string(), condition: z.string() }),
  z.object({ type: z.literal("spell_slot_use"), target: z.string(), level: z.number() }),
  z.object({ type: z.literal("spell_slot_restore"), target: z.string(), level: z.number() }),
  z.object({ type: z.literal("resource_use"), target: z.string(), resource: z.string() }),
  z.object({
    type: z.literal("resource_restore"),
    target: z.string(),
    resource: z.string(),
    amount: z.number(),
  }),
  z.object({ type: z.literal("death_save"), target: z.string(), success: z.boolean() }),
  z.object({
    type: z.literal("item_add"),
    target: z.string(),
    item: z.string(),
    quantity: z.number(),
  }),
  z.object({
    type: z.literal("item_remove"),
    target: z.string(),
    item: z.string(),
    quantity: z.number(),
  }),
  z.object({
    type: z.literal("item_update"),
    target: z.string(),
    item: z.string(),
    changes: z.string(),
  }),
  z.object({ type: z.literal("combatant_add"), combatant: combatantSchema }),
  z.object({ type: z.literal("combatant_remove"), combatantId: z.string() }),
  z.object({ type: z.literal("initiative_set"), combatantId: z.string(), value: z.number() }),
  z.object({
    type: z.literal("move"),
    combatantId: z.string(),
    from: gridPositionSchema,
    to: gridPositionSchema,
  }),
  z.object({ type: z.literal("combat_phase"), phase: combatPhaseSchema }),
  z.object({ type: z.literal("encounter_phase"), phase: encounterPhaseSchema }),
]);

// ─── Event Log ───

export const gameEventTypeSchema = z.enum([
  "damage",
  "healing",
  "condition_added",
  "condition_removed",
  "spell_slot_used",
  "spell_slot_restored",
  "resource_used",
  "resource_restored",
  "hp_set",
  "temp_hp_set",
  "death_save",
  "combat_start",
  "combat_end",
  "turn_start",
  "turn_end",
  "check_requested",
  "check_resolved",
  "initiative_rolled",
  "rest_short",
  "rest_long",
  "item_added",
  "item_removed",
  "item_updated",
  "inspiration_granted",
  "inspiration_used",
  "ai_response",
  "custom",
]);

// Note: We use z.any() for the stateBefore snapshot since it contains
// CharacterDynamicData records which are defined in messages.ts schemas.
// Full validation happens at the application layer.
export const gameEventSchema = z.object({
  id: z.string(),
  type: gameEventTypeSchema,
  timestamp: z.number(),
  description: z.string(),
  stateBefore: z.object({
    characters: z.record(z.string(), z.any()),
    combatants: z.record(z.string(), combatantSchema).optional(),
    encounterPhase: encounterPhaseSchema.optional(),
    pendingCheck: checkRequestSchema.optional(),
    map: battleMapStateSchema.optional(),
  }),
  conversationIndex: z.number(),
  changes: z.array(stateChangeSchema),
});

// ─── Campaign Journal ───

export const journalNPCSchema = z.object({
  name: z.string(),
  role: z.string(),
  disposition: z.string(),
  lastSeen: z.string().optional(),
});

export const campaignJournalSchema = z.object({
  storySummary: z.string(),
  activeQuest: z.string().optional(),
  completedQuests: z.array(z.string()),
  npcs: z.array(journalNPCSchema),
  locations: z.array(z.string()),
  notableItems: z.array(z.string()),
  partyLevel: z.number(),
});

// ─── Game State ───

export const gameStateSchema = z.object({
  encounter: encounterStateSchema.nullable(),
  eventLog: z.array(gameEventSchema),
  pacingProfile: pacingProfileSchema,
  encounterLength: encounterLengthSchema,
  customSystemPrompt: z.string().optional(),
  pendingCheck: checkRequestSchema.optional(),
  journal: campaignJournalSchema.optional(),
});
