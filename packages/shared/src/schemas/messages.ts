import { z } from "zod";
import {
  gridPositionSchema,
  checkRequestSchema,
  checkResultSchema,
  rollResultSchema,
  combatStateSchema,
  battleMapStateSchema,
  gameStateSchema,
  gameEventSchema,
  pacingProfileSchema,
  encounterLengthSchema,
} from "./game-state";

// === Auth schemas ===

export const authUserSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  avatarUrl: z.string().optional(),
});

// === Character schemas ===

export const abilityScoresSchema = z.object({
  strength: z.number(),
  dexterity: z.number(),
  constitution: z.number(),
  intelligence: z.number(),
  wisdom: z.number(),
  charisma: z.number(),
});

export const characterClassSchema = z.object({
  name: z.string(),
  level: z.number(),
  subclass: z.string().optional(),
});

export const characterSpellSchema = z.object({
  name: z.string(),
  level: z.number(),
  prepared: z.boolean(),
  alwaysPrepared: z.boolean(),
  spellSource: z.enum(["class", "race", "feat", "item", "background"]),
  knownByClass: z.boolean(),
  school: z.string().optional(),
  castingTime: z.string().optional(),
  range: z.string().optional(),
  components: z.string().optional(),
  duration: z.string().optional(),
  description: z.string().optional(),
  ritual: z.boolean().optional(),
  concentration: z.boolean().optional(),
  sourceClass: z.string().optional(),
});

export const spellSlotLevelSchema = z.object({
  level: z.number(),
  total: z.number(),
  used: z.number(),
});

export const inventoryItemSchema = z.object({
  name: z.string(),
  equipped: z.boolean(),
  quantity: z.number(),
  type: z.string().optional(),
  armorClass: z.number().optional(),
  description: z.string().optional(),
  damage: z.string().optional(),
  damageType: z.string().optional(),
  range: z.string().optional(),
  attackBonus: z.number().optional(),
  properties: z.array(z.string()).optional(),
  weight: z.number().optional(),
  rarity: z.string().optional(),
  attunement: z.boolean().optional(),
  isAttuned: z.boolean().optional(),
  isMagicItem: z.boolean().optional(),
});

export const currencySchema = z.object({
  cp: z.number(),
  sp: z.number(),
  ep: z.number(),
  gp: z.number(),
  pp: z.number(),
});

export const characterTraitsSchema = z.object({
  personalityTraits: z.string().optional(),
  ideals: z.string().optional(),
  bonds: z.string().optional(),
  flaws: z.string().optional(),
});

export const deathSavesSchema = z.object({
  successes: z.number(),
  failures: z.number(),
});

export const skillProficiencySchema = z.object({
  name: z.string(),
  ability: z.enum([
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ]),
  proficient: z.boolean(),
  expertise: z.boolean(),
  bonus: z.number().optional(),
});

export const savingThrowProficiencySchema = z.object({
  ability: z.enum([
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ]),
  proficient: z.boolean(),
  bonus: z.number().optional(),
});

export const characterFeatureSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["class", "race", "feat", "background"]),
  sourceLabel: z.string(),
  requiredLevel: z.number().optional(),
  activationType: z.string().optional(),
});

export const advantageEntrySchema = z.object({
  type: z.enum(["advantage", "disadvantage"]),
  subType: z.string(),
  restriction: z.string().optional(),
  source: z.string(),
});

export const proficiencyGroupSchema = z.object({
  armor: z.array(z.string()),
  weapons: z.array(z.string()),
  tools: z.array(z.string()),
  other: z.array(z.string()),
});

export const classResourceSchema = z.object({
  name: z.string(),
  maxUses: z.number(),
  resetType: z.enum(["short", "long"]),
  source: z.string(),
});

export const characterStaticDataSchema = z.object({
  name: z.string(),
  race: z.string(),
  classes: z.array(characterClassSchema),
  abilities: abilityScoresSchema,
  maxHP: z.number(),
  armorClass: z.number(),
  proficiencyBonus: z.number(),
  speed: z.number(),
  features: z.array(characterFeatureSchema),
  classResources: z.array(classResourceSchema).optional().default([]),
  proficiencies: proficiencyGroupSchema,
  skills: z.array(skillProficiencySchema),
  savingThrows: z.array(savingThrowProficiencySchema),
  senses: z.array(z.string()),
  languages: z.array(z.string()),
  spells: z.array(characterSpellSchema),
  spellcastingAbility: z
    .enum([
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ])
    .optional(),
  spellSaveDC: z.number().optional(),
  spellAttackBonus: z.number().optional(),
  advantages: z.array(advantageEntrySchema),
  traits: characterTraitsSchema,
  importedAt: z.number(),
  sourceUrl: z.string().optional(),
  ddbId: z.number().optional(),
});

export const characterDynamicDataSchema = z.object({
  currentHP: z.number(),
  tempHP: z.number(),
  spellSlotsUsed: z.array(spellSlotLevelSchema),
  pactMagicSlots: z.array(spellSlotLevelSchema).optional().default([]),
  resourcesUsed: z.record(z.string(), z.number()).optional().default({}),
  conditions: z.array(z.string()),
  deathSaves: deathSavesSchema,
  inventory: z.array(inventoryItemSchema),
  currency: currencySchema,
  xp: z.number(),
});

export const characterDataSchema = z.object({
  static: characterStaticDataSchema,
  dynamic: characterDynamicDataSchema,
});

export const playerInfoSchema = z.object({
  name: z.string(),
  online: z.boolean(),
  isHost: z.boolean(),
});

// === Client → Server schemas ===

export const clientChatSchema = z.object({
  type: z.literal("client:chat"),
  content: z.string().min(1).max(2000),
  playerName: z.string().min(1).max(30),
});

export const clientJoinSchema = z.object({
  type: z.literal("client:join"),
  playerName: z.string().min(1).max(30),
  roomCode: z.string().length(6),
  authToken: z.string().optional(),
  guestId: z.string().optional(),
  password: z.string().optional(),
});

export const clientDMResponseSchema = z.object({
  type: z.literal("client:dm_response"),
  requestId: z.string(),
  text: z.string(),
  error: z.string().optional(),
});

export const clientDMConfigSchema = z.object({
  type: z.literal("client:dm_config"),
  provider: z.string(),
  supportsTools: z.boolean(),
  campaigns: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        lastPlayedAt: z.string(),
        sessionCount: z.number(),
      })
    )
    .optional(),
});

export const clientSetCampaignSchema = z.object({
  type: z.literal("client:set_campaign"),
  campaignSlug: z.string().optional(),
  newCampaignName: z.string().optional(),
});

export const clientCampaignLoadedSchema = z.object({
  type: z.literal("client:campaign_loaded"),
  campaignSlug: z.string(),
  campaignName: z.string(),
  sessionCount: z.number(),
});

export const clientSetPasswordSchema = z.object({
  type: z.literal("client:set_password"),
  password: z.string().max(100),
});

export const clientKickPlayerSchema = z.object({
  type: z.literal("client:kick_player"),
  playerName: z.string().min(1).max(30),
});

export const clientSetCharacterSchema = z.object({
  type: z.literal("client:set_character"),
  character: characterDataSchema,
});

export const clientStartStorySchema = z.object({
  type: z.literal("client:start_story"),
});

export const clientRollDiceSchema = z.object({
  type: z.literal("client:roll_dice"),
  checkRequestId: z.string(),
});

export const clientCombatActionSchema = z.object({
  type: z.literal("client:combat_action"),
  action: z.string().min(1).max(2000),
});

export const clientMoveTokenSchema = z.object({
  type: z.literal("client:move_token"),
  to: gridPositionSchema,
});

export const clientRollbackSchema = z.object({
  type: z.literal("client:rollback"),
  eventId: z.string(),
});

export const clientSetSystemPromptSchema = z.object({
  type: z.literal("client:set_system_prompt"),
  prompt: z.string().optional(),
});

export const clientSetPacingSchema = z.object({
  type: z.literal("client:set_pacing"),
  profile: pacingProfileSchema,
  encounterLength: encounterLengthSchema,
});

export const clientDMOverrideSchema = z.object({
  type: z.literal("client:dm_override"),
  characterName: z.string(),
  changes: z.array(z.any()), // StateChange is a union, validated at runtime
});

export const clientEndTurnSchema = z.object({
  type: z.literal("client:end_turn"),
});

export const clientDestroyRoomSchema = z.object({
  type: z.literal("client:destroy_room"),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  clientChatSchema,
  clientJoinSchema,
  clientDMResponseSchema,
  clientDMConfigSchema,
  clientSetCampaignSchema,
  clientCampaignLoadedSchema,
  clientSetPasswordSchema,
  clientKickPlayerSchema,
  clientSetCharacterSchema,
  clientStartStorySchema,
  clientRollDiceSchema,
  clientCombatActionSchema,
  clientMoveTokenSchema,
  clientRollbackSchema,
  clientSetSystemPromptSchema,
  clientSetPacingSchema,
  clientDMOverrideSchema,
  clientEndTurnSchema,
  clientDestroyRoomSchema,
]);

// === Server → Client schemas ===

export const serverChatSchema = z.object({
  type: z.literal("server:chat"),
  content: z.string(),
  playerName: z.string(),
  timestamp: z.number(),
  id: z.string(),
});

export const serverAISchema = z.object({
  type: z.literal("server:ai"),
  content: z.string(),
  timestamp: z.number(),
  id: z.string(),
});

export const serverSystemSchema = z.object({
  type: z.literal("server:system"),
  content: z.string(),
  timestamp: z.number(),
});

export const serverRoomJoinedSchema = z.object({
  type: z.literal("server:room_joined"),
  roomCode: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
  isHost: z.boolean().optional(),
  isReconnect: z.boolean().optional(),
  user: authUserSchema.optional(),
  characters: z.record(z.string(), characterDataSchema).optional(),
  allPlayers: z.array(playerInfoSchema).optional(),
  storyStarted: z.boolean().optional(),
  dmConnected: z.boolean(),
  activeCampaignSlug: z.string().optional(),
  activeCampaignName: z.string().optional(),
});

export const serverPlayerJoinedSchema = z.object({
  type: z.literal("server:player_joined"),
  playerName: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
  allPlayers: z.array(playerInfoSchema).optional(),
});

export const serverPlayerLeftSchema = z.object({
  type: z.literal("server:player_left"),
  playerName: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
  allPlayers: z.array(playerInfoSchema).optional(),
});

export const serverCharacterUpdatedSchema = z.object({
  type: z.literal("server:character_updated"),
  playerName: z.string(),
  character: characterDataSchema,
});

export const serverErrorSchema = z.object({
  type: z.literal("server:error"),
  message: z.string(),
  code: z.string(),
});

export const serverKickedSchema = z.object({
  type: z.literal("server:kicked"),
  reason: z.string(),
});

export const serverCheckRequestSchema = z.object({
  type: z.literal("server:check_request"),
  check: checkRequestSchema,
  timestamp: z.number(),
  id: z.string(),
});

export const serverCheckResultSchema = z.object({
  type: z.literal("server:check_result"),
  result: checkResultSchema,
  timestamp: z.number(),
  id: z.string(),
});

export const serverDiceRollSchema = z.object({
  type: z.literal("server:dice_roll"),
  roll: rollResultSchema,
  playerName: z.string(),
  timestamp: z.number(),
  id: z.string(),
});

export const serverCombatUpdateSchema = z.object({
  type: z.literal("server:combat_update"),
  combat: combatStateSchema.nullable(),
  map: battleMapStateSchema.nullable().optional(),
  timestamp: z.number(),
});

export const serverGameStateSyncSchema = z.object({
  type: z.literal("server:game_state_sync"),
  gameState: gameStateSchema,
});

export const serverRollbackSchema = z.object({
  type: z.literal("server:rollback"),
  toEventId: z.string(),
  gameState: gameStateSchema,
  characterUpdates: z.record(z.string(), characterDataSchema),
  timestamp: z.number(),
});

export const serverEventLogSchema = z.object({
  type: z.literal("server:event_log"),
  event: gameEventSchema,
});

export const serverDMRequestSchema = z.object({
  type: z.literal("server:dm_request"),
  requestId: z.string(),
  systemPrompt: z.string(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
});

export const serverDMConfigUpdateSchema = z.object({
  type: z.literal("server:dm_config_update"),
  provider: z.string(),
  supportsTools: z.boolean(),
  campaigns: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        lastPlayedAt: z.string(),
        sessionCount: z.number(),
      })
    )
    .optional(),
});

export const serverCampaignLoadedSchema = z.object({
  type: z.literal("server:campaign_loaded"),
  campaignSlug: z.string(),
  campaignName: z.string(),
  sessionCount: z.number(),
});

export const serverRoomDestroyedSchema = z.object({
  type: z.literal("server:room_destroyed"),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  serverChatSchema,
  serverAISchema,
  serverSystemSchema,
  serverRoomJoinedSchema,
  serverPlayerJoinedSchema,
  serverPlayerLeftSchema,
  serverErrorSchema,
  serverKickedSchema,
  serverCharacterUpdatedSchema,
  serverCheckRequestSchema,
  serverCheckResultSchema,
  serverDiceRollSchema,
  serverCombatUpdateSchema,
  serverGameStateSyncSchema,
  serverRollbackSchema,
  serverEventLogSchema,
  serverDMRequestSchema,
  serverDMConfigUpdateSchema,
  serverCampaignLoadedSchema,
  serverRoomDestroyedSchema,
]);
