/**
 * Schema ↔ Type equivalence guard rail.
 *
 * This file contains ONLY compile-time type-level assertions. TypeScript itself
 * is the test runner — if a `z.infer<Schema>` drifts from the hand-written type
 * it mirrors, `pnpm type-check` fails on the failing `_Check*` alias with a
 * "Type 'false' does not satisfy the constraint 'true'" error that names both
 * sides of the pair.
 *
 * Rules:
 * - Every mirrored (type, schema) pair in this package SHOULD have an
 *   `_CheckX = Assert<Equal<T, z.infer<typeof s>>` line here.
 * - When you add a new schema, add the matching assertion.
 * - When a pair is intentionally loose (e.g. `EffectBundle.effects` is
 *   `z.record(string, unknown)` in the schema but `EntityEffects` in the type),
 *   leave the assertion commented out with a TODO.
 * - If a type and schema diverge in closed-set discriminants or object shapes,
 *   the schema is usually the side to change. If the type claims richer
 *   structure than the schema enforces, tighten the schema rather than
 *   loosening the type.
 *
 * `Equal<A, B>` distinguishes `any` from concrete types correctly, so this
 * also catches accidental widening via `z.any()` islands.
 */

import { describe, it } from "vitest";
import type { z } from "zod";

import type {
  abilityScoresSchema,
  characterClassSchema,
  spellSchema,
  spellSlotLevelSchema,
  itemSchema,
  itemWeaponSchema,
  itemArmorSchema,
  currencySchema,
  characterTraitsSchema,
  characterAppearanceSchema,
  deathSavesSchema,
  characterFeatureRefSchema,
  combatBonusSchema,
  classResourceSchema,
  proficiencyGroupSchema,
  advantageEntrySchema,
  skillProficiencySchema,
  savingThrowProficiencySchema,
  characterStaticDataSchema,
  characterDynamicDataSchema,
  characterDataSchema,
  playerInfoSchema,
  effectSourceSchema,
  effectLifetimeSchema,
  dieSizeSchema,
  dieRollSchema,
  rollResultSchema,
  checkRequestSchema,
  checkResultSchema,
  gridPositionSchema,
  creatureSizeSchema,
  conditionEntrySchema,
  combatantSchema,
  combatPhaseSchema,
  combatStateSchema,
  encounterPhaseSchema,
  encounterStateSchema,
  pacingProfileSchema,
  encounterLengthSchema,
  battleMapStateSchema,
  mapTileSchema,
  tileObjectSchema,
  aoeOverlaySchema,
  stateChangeSchema,
  gameEventTypeSchema,
  gameEventSchema,
  journalNPCSchema,
  campaignJournalSchema,
  gameStateSchema,
  clientMessageSchema,
  serverMessageSchema,
  authUserSchema,
} from "../schemas";

import type {
  AbilityScores,
  CharacterClass,
  Spell,
  SpellSlotLevel,
  Item,
  Currency,
  CharacterTraits,
  CharacterAppearance,
  DeathSaves,
  CharacterFeatureRef,
  CombatBonus,
  ClassResource,
  ProficiencyGroup,
  AdvantageEntry,
  SkillProficiency,
  SavingThrowProficiency,
  CharacterStaticData,
  CharacterDynamicData,
  CharacterData,
  PlayerInfo,
  EffectSource,
  EffectLifetime,
  DieSize,
  DieRoll,
  RollResult,
  CheckRequest,
  CheckResult,
  GridPosition,
  CreatureSize,
  ConditionEntry,
  Combatant,
  CombatPhase,
  CombatState,
  EncounterPhase,
  EncounterState,
  PacingProfile,
  EncounterLength,
  BattleMapState,
  MapTile,
  TileObject,
  AoEOverlay,
  StateChange,
  GameEventType,
  GameEvent,
  JournalNPC,
  CampaignJournal,
  GameState,
  ClientMessage,
  ServerMessage,
  AuthUser,
} from "../types";

// ---------------------------------------------------------------------------
// Equivalence helper
// ---------------------------------------------------------------------------

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * Type-level assertion: fails `tsc` if T isn't exactly `true`. Usage:
 * `type _X = Assert<Equal<T, z.infer<typeof s>>>;` — a drift surfaces as
 * "Type 'false' does not satisfy the constraint 'true'" on that alias line.
 *
 * Note: we can't build an `Assert<Equal<A, B>` helper because inside its body
 * `Equal<A, B>` isn't narrowed (TS sees it as `boolean`). Inlining at the
 * usage site is what actually works.
 */
type Assert<T extends true> = T;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

// Character
type _01 = Assert<Equal<AbilityScores, z.infer<typeof abilityScoresSchema>>>;
type _02 = Assert<Equal<CharacterClass, z.infer<typeof characterClassSchema>>>;
type _03 = Assert<Equal<Spell, z.infer<typeof spellSchema>>>;
type _04 = Assert<Equal<SpellSlotLevel, z.infer<typeof spellSlotLevelSchema>>>;
type _05 = Assert<Equal<Item, z.infer<typeof itemSchema>>>;
type _06 = Assert<Equal<NonNullable<Item["weapon"]>, z.infer<typeof itemWeaponSchema>>>;
type _07 = Assert<Equal<NonNullable<Item["armor"]>, z.infer<typeof itemArmorSchema>>>;
type _08 = Assert<Equal<Currency, z.infer<typeof currencySchema>>>;
type _09 = Assert<Equal<CharacterTraits, z.infer<typeof characterTraitsSchema>>>;
type _10 = Assert<Equal<CharacterAppearance, z.infer<typeof characterAppearanceSchema>>>;
type _11 = Assert<Equal<DeathSaves, z.infer<typeof deathSavesSchema>>>;
type _12 = Assert<Equal<CharacterFeatureRef, z.infer<typeof characterFeatureRefSchema>>>;
type _13 = Assert<Equal<CombatBonus, z.infer<typeof combatBonusSchema>>>;
type _14 = Assert<Equal<ClassResource, z.infer<typeof classResourceSchema>>>;
type _15 = Assert<Equal<ProficiencyGroup, z.infer<typeof proficiencyGroupSchema>>>;
type _16 = Assert<Equal<AdvantageEntry, z.infer<typeof advantageEntrySchema>>>;
type _17 = Assert<Equal<SkillProficiency, z.infer<typeof skillProficiencySchema>>>;
type _18 = Assert<Equal<SavingThrowProficiency, z.infer<typeof savingThrowProficiencySchema>>>;
type _19 = Assert<Equal<CharacterStaticData, z.infer<typeof characterStaticDataSchema>>>;
type _20 = Assert<Equal<CharacterDynamicData, z.infer<typeof characterDynamicDataSchema>>>;
type _21 = Assert<Equal<CharacterData, z.infer<typeof characterDataSchema>>>;
type _22 = Assert<Equal<PlayerInfo, z.infer<typeof playerInfoSchema>>>;

// Effects
type _23 = Assert<Equal<EffectSource, z.infer<typeof effectSourceSchema>>>;
type _24 = Assert<Equal<EffectLifetime, z.infer<typeof effectLifetimeSchema>>>;
// TODO(phase-3): enable once effectBundleSchema.effects becomes structural
// (entityEffectsSchema) instead of z.record(z.string(), z.unknown()).
// type _25 = Assert<Equal<EffectBundle, z.infer<typeof effectBundleSchema>>>;

// Game state
type _30 = Assert<Equal<DieSize, z.infer<typeof dieSizeSchema>>>;
type _31 = Assert<Equal<DieRoll, z.infer<typeof dieRollSchema>>>;
type _32 = Assert<Equal<RollResult, z.infer<typeof rollResultSchema>>>;
type _33 = Assert<Equal<CheckRequest, z.infer<typeof checkRequestSchema>>>;
type _34 = Assert<Equal<CheckResult, z.infer<typeof checkResultSchema>>>;
type _35 = Assert<Equal<GridPosition, z.infer<typeof gridPositionSchema>>>;
type _36 = Assert<Equal<CreatureSize, z.infer<typeof creatureSizeSchema>>>;
type _37 = Assert<Equal<ConditionEntry, z.infer<typeof conditionEntrySchema>>>;
type _38 = Assert<Equal<Combatant, z.infer<typeof combatantSchema>>>;
type _39 = Assert<Equal<CombatPhase, z.infer<typeof combatPhaseSchema>>>;
type _40 = Assert<Equal<CombatState, z.infer<typeof combatStateSchema>>>;
type _41 = Assert<Equal<EncounterPhase, z.infer<typeof encounterPhaseSchema>>>;
type _42 = Assert<Equal<EncounterState, z.infer<typeof encounterStateSchema>>>;
type _43 = Assert<Equal<PacingProfile, z.infer<typeof pacingProfileSchema>>>;
type _44 = Assert<Equal<EncounterLength, z.infer<typeof encounterLengthSchema>>>;
type _45 = Assert<Equal<BattleMapState, z.infer<typeof battleMapStateSchema>>>;
type _46 = Assert<Equal<MapTile, z.infer<typeof mapTileSchema>>>;
type _47 = Assert<Equal<TileObject, z.infer<typeof tileObjectSchema>>>;
type _48 = Assert<Equal<AoEOverlay, z.infer<typeof aoeOverlaySchema>>>;
type _49 = Assert<Equal<StateChange, z.infer<typeof stateChangeSchema>>>;
type _50 = Assert<Equal<GameEventType, z.infer<typeof gameEventTypeSchema>>>;
type _51 = Assert<Equal<GameEvent, z.infer<typeof gameEventSchema>>>;
type _52 = Assert<Equal<JournalNPC, z.infer<typeof journalNPCSchema>>>;
type _53 = Assert<Equal<CampaignJournal, z.infer<typeof campaignJournalSchema>>>;
type _54 = Assert<Equal<GameState, z.infer<typeof gameStateSchema>>>;

// Messages
type _60 = Assert<Equal<AuthUser, z.infer<typeof authUserSchema>>>;
type _61 = Assert<Equal<ClientMessage, z.infer<typeof clientMessageSchema>>>;
type _62 = Assert<Equal<ServerMessage, z.infer<typeof serverMessageSchema>>>;

// Per-variant client messages — narrows which discriminant variant is drifting
import type {
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
} from "../schemas";
import type {
  ClientChatMessage,
  ClientJoinMessage,
  ClientDMResponseMessage,
  ClientDMConfigMessage,
  ClientSetCampaignMessage,
  ClientCampaignLoadedMessage,
  ClientStoryStartedMessage,
  ClientConfigureCampaignMessage,
  ClientCampaignConfiguredAckMessage,
  ClientSetPasswordMessage,
  ClientKickPlayerMessage,
  ClientSetCharacterMessage,
  ClientStartStoryMessage,
  ClientRollDiceMessage,
  ClientCombatActionMessage,
  ClientMoveTokenMessage,
  ClientRollbackMessage,
  ClientSetSystemPromptMessage,
  ClientSetPacingMessage,
  ClientDMOverrideMessage,
  ClientEndTurnMessage,
  ClientDestroyRoomMessage,
  ClientDMDiceRollMessage,
  ClientDMCheckRequestMessage,
  ClientDMCheckResultMessage,
  ClientBroadcastMessage,
  ClientActionResultMessage,
  ClientTypingMessage,
  ClientSaveNotesMessage,
} from "../types";
type _C01 = Assert<Equal<ClientChatMessage, z.infer<typeof clientChatSchema>>>;
type _C02 = Assert<Equal<ClientJoinMessage, z.infer<typeof clientJoinSchema>>>;
type _C03 = Assert<Equal<ClientDMResponseMessage, z.infer<typeof clientDMResponseSchema>>>;
type _C04 = Assert<Equal<ClientDMConfigMessage, z.infer<typeof clientDMConfigSchema>>>;
type _C05 = Assert<Equal<ClientSetCampaignMessage, z.infer<typeof clientSetCampaignSchema>>>;
type _C06 = Assert<Equal<ClientCampaignLoadedMessage, z.infer<typeof clientCampaignLoadedSchema>>>;
type _C07 = Assert<Equal<ClientStoryStartedMessage, z.infer<typeof clientStoryStartedSchema>>>;
type _C08 = Assert<
  Equal<ClientConfigureCampaignMessage, z.infer<typeof clientConfigureCampaignSchema>>
>;
type _C09 = Assert<
  Equal<ClientCampaignConfiguredAckMessage, z.infer<typeof clientCampaignConfiguredAckSchema>>
>;
type _C10 = Assert<Equal<ClientSetPasswordMessage, z.infer<typeof clientSetPasswordSchema>>>;
type _C11 = Assert<Equal<ClientKickPlayerMessage, z.infer<typeof clientKickPlayerSchema>>>;
type _C12 = Assert<Equal<ClientSetCharacterMessage, z.infer<typeof clientSetCharacterSchema>>>;
type _C13 = Assert<Equal<ClientStartStoryMessage, z.infer<typeof clientStartStorySchema>>>;
type _C14 = Assert<Equal<ClientRollDiceMessage, z.infer<typeof clientRollDiceSchema>>>;
type _C15 = Assert<Equal<ClientCombatActionMessage, z.infer<typeof clientCombatActionSchema>>>;
type _C16 = Assert<Equal<ClientMoveTokenMessage, z.infer<typeof clientMoveTokenSchema>>>;
type _C17 = Assert<Equal<ClientRollbackMessage, z.infer<typeof clientRollbackSchema>>>;
type _C18 = Assert<
  Equal<ClientSetSystemPromptMessage, z.infer<typeof clientSetSystemPromptSchema>>
>;
type _C19 = Assert<Equal<ClientSetPacingMessage, z.infer<typeof clientSetPacingSchema>>>;
type _C20 = Assert<Equal<ClientDMOverrideMessage, z.infer<typeof clientDMOverrideSchema>>>;
type _C21 = Assert<Equal<ClientEndTurnMessage, z.infer<typeof clientEndTurnSchema>>>;
type _C22 = Assert<Equal<ClientDestroyRoomMessage, z.infer<typeof clientDestroyRoomSchema>>>;
type _C23 = Assert<Equal<ClientDMDiceRollMessage, z.infer<typeof clientDMDiceRollSchema>>>;
type _C24 = Assert<Equal<ClientDMCheckRequestMessage, z.infer<typeof clientDMCheckRequestSchema>>>;
type _C25 = Assert<Equal<ClientDMCheckResultMessage, z.infer<typeof clientDMCheckResultSchema>>>;
type _C26 = Assert<Equal<ClientBroadcastMessage, z.infer<typeof clientBroadcastSchema>>>;
type _C27 = Assert<Equal<ClientActionResultMessage, z.infer<typeof clientActionResultSchema>>>;
type _C28 = Assert<Equal<ClientTypingMessage, z.infer<typeof clientTypingSchema>>>;
type _C29 = Assert<Equal<ClientSaveNotesMessage, z.infer<typeof clientSaveNotesSchema>>>;

// ---------------------------------------------------------------------------
// Vitest wrapper — no runtime work. The assertions above run at tsc time.
// Silence "declared but never used" by re-referencing the aliases.
// ---------------------------------------------------------------------------

export type __Checks = [
  _01,
  _02,
  _03,
  _04,
  _05,
  _06,
  _07,
  _08,
  _09,
  _10,
  _11,
  _12,
  _13,
  _14,
  _15,
  _16,
  _17,
  _18,
  _19,
  _20,
  _21,
  _22,
  _23,
  _24,
  _30,
  _31,
  _32,
  _33,
  _34,
  _35,
  _36,
  _37,
  _38,
  _39,
  _40,
  _41,
  _42,
  _43,
  _44,
  _45,
  _46,
  _47,
  _48,
  _49,
  _50,
  _51,
  _52,
  _53,
  _54,
  _60,
  _61,
  _62,
];

describe("schema-type-equivalence", () => {
  it("compiles (type-level only)", () => {
    // intentionally empty
  });
});
