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
  conditionEntrySchema,
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

export const spellSchema = z.object({
  // Spell metadata (required — enriched once at build time)
  name: z.string(),
  level: z.number(),
  school: z.string(),
  castingTime: z.string(),
  range: z.string(),
  components: z.string(),
  duration: z.string(),
  ritual: z.boolean(),
  concentration: z.boolean(),
  description: z.string(),
  // Character-bound fields
  prepared: z.boolean(),
  alwaysPrepared: z.boolean(),
  spellSource: z.enum(["class", "race", "feat", "item", "species"]),
  knownByClass: z.boolean(),
  sourceClass: z.string(),
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
  ability: z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
  proficient: z.boolean(),
  expertise: z.boolean(),
  bonus: z.number().optional(),
});

export const savingThrowProficiencySchema = z.object({
  ability: z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
  proficient: z.boolean(),
  bonus: z.number().optional(),
});

export const characterFeatureSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["class", "race", "feat", "background"]),
  sourceLabel: z.string(),
  requiredLevel: z.number().optional(),
  activationType: z.enum(["action", "bonus", "reaction"]).optional(),
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
  longRest: z.union([z.number(), z.literal("all")]),
  shortRest: z.union([z.number(), z.literal("all")]).optional(),
  source: z.string(),
});

export const combatBonusSchema = z.object({
  type: z.enum(["attack", "damage", "initiative"]),
  value: z.number(),
  attackType: z.enum(["melee", "ranged", "spell"]).optional(),
  source: z.string(),
  condition: z.string().optional(),
});

export const characterAppearanceSchema = z.object({
  gender: z.string().optional(),
  age: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  hair: z.string().optional(),
  eyes: z.string().optional(),
  skin: z.string().optional(),
});

export const characterStaticDataSchema = z.object({
  name: z.string(),
  species: z.string().optional(),
  race: z.string(),
  classes: z.array(characterClassSchema),
  abilities: abilityScoresSchema,
  maxHP: z.number(),
  armorClass: z.number(),
  proficiencyBonus: z.number(),
  speed: z.object({
    walk: z.number(),
    fly: z.number().optional(),
    swim: z.number().optional(),
    climb: z.number().optional(),
    burrow: z.number().optional(),
  }),
  features: z.array(characterFeatureSchema),
  classResources: z.array(classResourceSchema).optional().default([]),
  proficiencies: proficiencyGroupSchema,
  skills: z.array(skillProficiencySchema),
  savingThrows: z.array(savingThrowProficiencySchema),
  senses: z.array(z.string()),
  languages: z.array(z.string()),
  spells: z.array(spellSchema),
  spellcasting: z
    .record(
      z.string(),
      z.object({
        ability: z.enum([
          "strength",
          "dexterity",
          "constitution",
          "intelligence",
          "wisdom",
          "charisma",
        ]),
        dc: z.number(),
        attackBonus: z.number(),
      }),
    )
    .optional(),
  advantages: z.array(advantageEntrySchema),
  combatBonuses: z.array(combatBonusSchema).optional(),
  traits: characterTraitsSchema,
  appearance: characterAppearanceSchema.optional(),
  backstory: z.string().optional(),
  alignment: z.string().optional(),
  importedAt: z.number(),
  source: z.enum(["builder"]).optional(),
});

export const characterDynamicDataSchema = z.object({
  currentHP: z.number(),
  tempHP: z.number(),
  spellSlotsUsed: z.array(spellSlotLevelSchema),
  pactMagicSlots: z.array(spellSlotLevelSchema).optional().default([]),
  resourcesUsed: z.record(z.string(), z.number()).optional().default({}),
  conditions: z.array(conditionEntrySchema),
  exhaustionLevel: z.number().optional(),
  deathSaves: deathSavesSchema,
  inventory: z.array(inventoryItemSchema),
  currency: currencySchema,
  heroicInspiration: z.boolean().optional().default(false),
  concentratingOn: z.object({ spellName: z.string(), since: z.number().optional() }).optional(),
});

export const characterDataSchema = z.object({
  builder: z.any(),
  static: characterStaticDataSchema,
  dynamic: characterDynamicDataSchema,
});

export const playerInfoSchema = z.object({
  name: z.string(),
  online: z.boolean(),
  isHost: z.boolean(),
  isDM: z.boolean().optional(),
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
  isDM: z.boolean().optional(),
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
        pacingProfile: z.string().optional(),
        encounterLength: z.string().optional(),
        customPrompt: z.string().optional(),
      }),
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

export const clientStoryStartedSchema = z.object({
  type: z.literal("client:story_started"),
});

export const clientConfigureCampaignSchema = z.object({
  type: z.literal("client:configure_campaign"),
  campaignName: z.string().min(1).max(100),
  systemPrompt: z.string().optional(),
  pacingProfile: pacingProfileSchema,
  encounterLength: encounterLengthSchema,
  existingCampaignSlug: z.string().optional(),
});

export const clientCampaignConfiguredAckSchema = z.object({
  type: z.literal("client:campaign_configured_ack"),
  campaignSlug: z.string(),
  campaignName: z.string(),
  pacingProfile: pacingProfileSchema,
  encounterLength: encounterLengthSchema,
  systemPrompt: z.string().optional(),
  restoredCharacters: z.record(z.string(), characterDataSchema).optional(),
  characterUserIds: z.record(z.string(), z.string()).optional(),
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

export const clientDMDiceRollSchema = z.object({
  type: z.literal("client:dm_dice_roll"),
  roll: rollResultSchema,
  reason: z.string().optional(),
});

export const clientDMCheckRequestSchema = z.object({
  type: z.literal("client:dm_check_request"),
  checkType: z.string().optional(),
  targetCharacter: z.string(),
  dc: z.number().optional(),
  reason: z.string(),
  notation: z.string(),
});

export const clientDMCheckResultSchema = z.object({
  type: z.literal("client:dm_check_result"),
  checkRequestId: z.string(),
  roll: rollResultSchema,
  success: z.boolean().optional(),
  characterName: z.string(),
  dc: z.number().optional(),
  playerName: z.string(),
});

export const clientEndTurnSchema = z.object({
  type: z.literal("client:end_turn"),
});

export const clientDestroyRoomSchema = z.object({
  type: z.literal("client:destroy_room"),
});

export const clientTypingSchema = z.object({
  type: z.literal("client:typing"),
  isTyping: z.boolean(),
});

export const clientSaveNotesSchema = z.object({
  type: z.literal("client:save_notes"),
  content: z.string().max(50000),
});

export const clientBroadcastSchema = z.object({
  type: z.literal("client:broadcast"),
  payload: z.any(), // ServerMessage validated at runtime
  targets: z.array(z.string()).optional(),
});

export const clientActionResultSchema = z.object({
  type: z.literal("client:action_result"),
  requestId: z.string(),
  error: z.string().optional(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  clientChatSchema,
  clientJoinSchema,
  clientDMResponseSchema,
  clientDMConfigSchema,
  clientSetCampaignSchema,
  clientCampaignLoadedSchema,
  clientStoryStartedSchema,
  clientConfigureCampaignSchema,
  clientCampaignConfiguredAckSchema,
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
  clientDMDiceRollSchema,
  clientDMCheckRequestSchema,
  clientDMCheckResultSchema,
  clientBroadcastSchema,
  clientActionResultSchema,
  clientTypingSchema,
  clientSaveNotesSchema,
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
  id: z.string().optional(),
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
  campaignConfigured: z.boolean().optional(),
  activeCampaignSlug: z.string().optional(),
  activeCampaignName: z.string().optional(),
});

export const serverPlayerJoinedSchema = z.object({
  type: z.literal("server:player_joined"),
  playerName: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
  allPlayers: z.array(playerInfoSchema).optional(),
  isDM: z.boolean().optional(),
});

export const serverPlayerLeftSchema = z.object({
  type: z.literal("server:player_left"),
  playerName: z.string(),
  players: z.array(z.string()),
  hostName: z.string(),
  allPlayers: z.array(playerInfoSchema).optional(),
  isDM: z.boolean().optional(),
});

export const serverCharacterUpdatedSchema = z.object({
  type: z.literal("server:character_updated"),
  playerName: z.string(),
  character: characterDataSchema,
  source: z.enum(["player", "system"]).optional(),
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
  checkRequestId: z.string().optional(),
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
  characters: z.record(z.string(), characterDataSchema).optional(),
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
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
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
        pacingProfile: z.string().optional(),
        encounterLength: z.string().optional(),
        customPrompt: z.string().optional(),
      }),
    )
    .optional(),
});

export const serverCampaignLoadedSchema = z.object({
  type: z.literal("server:campaign_loaded"),
  campaignSlug: z.string(),
  campaignName: z.string(),
  sessionCount: z.number(),
});

export const serverCampaignConfiguredSchema = z.object({
  type: z.literal("server:campaign_configured"),
  campaignName: z.string(),
  campaignSlug: z.string(),
  pacingProfile: pacingProfileSchema,
  encounterLength: encounterLengthSchema,
  systemPrompt: z.string().optional(),
  restoredCharacters: z.record(z.string(), characterDataSchema).optional(),
});

export const serverCharacterForCampaignSchema = z.object({
  type: z.literal("server:character_for_campaign"),
  playerName: z.string(),
  userId: z.string().optional(),
  character: characterDataSchema,
});

export const serverDMRollRequestSchema = z.object({
  type: z.literal("server:dm_roll_request"),
  checkRequestId: z.string(),
  playerName: z.string(),
});

export const serverPlayerActionSchema = z.object({
  type: z.literal("server:player_action"),
  playerName: z.string(),
  userId: z.string().optional(),
  action: z.any(), // ClientMessage validated at runtime
  requestId: z.string(),
});

export const serverTypingSchema = z.object({
  type: z.literal("server:typing"),
  playerName: z.string(),
  isTyping: z.boolean(),
});

export const serverPlayerNotesLoadedSchema = z.object({
  type: z.literal("server:player_notes_loaded"),
  content: z.string(),
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
  serverCampaignConfiguredSchema,
  serverCharacterForCampaignSchema,
  serverDMRollRequestSchema,
  serverPlayerActionSchema,
  serverRoomDestroyedSchema,
  serverTypingSchema,
  serverPlayerNotesLoadedSchema,
]);
