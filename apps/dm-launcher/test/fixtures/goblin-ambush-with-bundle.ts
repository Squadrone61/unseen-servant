/**
 * Fixture: Mid-combat goblin ambush — Theron (Fighter 5) vs Grixx (Goblin Boss) + Sneak (Goblin).
 *
 * Combat is already in progress, round 1, **Grixx's turn** (NPC). The
 * EncounterBundle "goblin-ambush-river-a3f" is pre-saved into the campaign so
 * the conductor / combat-resolver can `load_encounter_bundle` instead of
 * looking up monster stats per turn.
 *
 * The bundle covers every ability the resolver should plausibly use this turn:
 *   - Grixx: Multiattack, Redirect Attack
 *   - Sneak: Shortbow
 *
 * If the resolver calls `lookup_rule` for any of these, the bundle contract is
 * being violated.
 */
import { buildCharacter } from "@unseen-servant/shared/builders";
import { makeFighterBuilderState } from "@unseen-servant/shared/test-helpers";
import type {
  CombatState,
  Combatant,
  EncounterBundle,
  GameState,
} from "@unseen-servant/shared/types";
import type { FixtureWorld } from "../harness/types.js";

const BUNDLE_SLUG = "goblin-ambush-river-a3f";

const GRIXX_ID = "npc-grixx";
const SNEAK_ID = "npc-sneak";
const THERON_ID = "pc-theron";

function buildBundle(): EncounterBundle {
  return {
    slug: BUNDLE_SLUG,
    createdSession: 1,
    createdAt: "2026-04-26T12:00:00.000Z",
    difficulty: "moderate",
    partySnapshot: [{ name: "Theron", level: 5 }],
    combatants: [
      {
        name: "Grixx",
        monsterRef: "goblin-boss",
        hp: 21,
        ac: 17,
        speed: { walk: 30 },
        intelligence: 10,
        tacticsNote:
          "Multiattacks the most-armored melee threat. Holds Redirect Attack until first hit.",
        abilities: [
          {
            name: "Multiattack",
            kind: "attack",
            actionRef: "monster:goblin-boss/multiattack",
            summary: "Two scimitar attacks, +4 to hit, 1d6+2 slashing each.",
          },
          {
            name: "Redirect Attack",
            kind: "reaction",
            actionRef: "monster:goblin-boss/redirect-attack",
            summary: "When hit by an attack, swap an adjacent goblin to take the hit instead.",
            trigger: "when hit by an attack",
            uses: { perRound: 1 },
          },
        ],
      },
      {
        name: "Sneak",
        monsterRef: "goblin",
        hp: 7,
        ac: 15,
        speed: { walk: 30 },
        intelligence: 10,
        tacticsNote: "Stays at range, shoots from cover. Disengages if engaged.",
        abilities: [
          {
            name: "Shortbow",
            kind: "attack",
            actionRef: "monster:goblin/shortbow",
            summary: "Ranged Weapon Attack: +4 to hit, range 80/320 ft., 1d6+2 piercing.",
          },
        ],
      },
    ],
    mapName: "River Crossing",
    openingPositions: [
      { name: "Grixx", pos: "D5" },
      { name: "Sneak", pos: "F8" },
      { name: "Theron", pos: "B5" },
    ],
    tacticsHint: "Goblins flank from cover; Grixx hangs back, redirects fatal hits to Sneak.",
    citations: [
      "lookup_rule(goblin-boss, monster) -> MM 2024 p.166",
      "lookup_rule(goblin, monster) -> MM 2024 p.165",
      "calculate_encounter_difficulty([5], ['3','1/4']) -> moderate",
    ],
  };
}

function buildCombatants(): Record<string, Combatant> {
  const grixx: Combatant = {
    id: GRIXX_ID,
    name: "Grixx",
    type: "enemy",
    initiative: 17,
    initiativeModifier: 2,
    dexScore: 14,
    speed: { walk: 30 },
    baseSpeed: { walk: 30 },
    movementUsed: 0,
    position: { x: 3, y: 4 },
    size: "small",
    maxHP: 21,
    currentHP: 21,
    tempHP: 0,
    armorClass: 17,
    conditions: [],
  };
  const sneak: Combatant = {
    id: SNEAK_ID,
    name: "Sneak",
    type: "enemy",
    initiative: 12,
    initiativeModifier: 2,
    dexScore: 14,
    speed: { walk: 30 },
    baseSpeed: { walk: 30 },
    movementUsed: 0,
    position: { x: 5, y: 7 },
    size: "small",
    maxHP: 7,
    currentHP: 7,
    tempHP: 0,
    armorClass: 15,
    conditions: [],
  };
  const theron: Combatant = {
    id: THERON_ID,
    name: "Theron",
    type: "player",
    playerId: "Theron",
    initiative: 14,
    initiativeModifier: 2,
    dexScore: 14,
    speed: { walk: 30 },
    baseSpeed: { walk: 30 },
    movementUsed: 0,
    position: { x: 1, y: 4 },
    size: "medium",
  };
  return { [GRIXX_ID]: grixx, [SNEAK_ID]: sneak, [THERON_ID]: theron };
}

export function buildFixture(): FixtureWorld {
  const { state, inventory, currency, traits } = makeFighterBuilderState();
  const { character: theron } = buildCharacter(state, { inventory, currency, traits });

  const combat: CombatState = {
    phase: "active",
    round: 1,
    turnIndex: 0,
    turnOrder: [GRIXX_ID, THERON_ID, SNEAK_ID],
    combatants: buildCombatants(),
    bundleSlug: BUNDLE_SLUG,
  };

  const gameState: Partial<GameState> = {
    encounter: {
      id: "enc-goblin-ambush",
      phase: "combat",
      combat,
    },
    eventLog: [],
    pacingProfile: "balanced",
    encounterLength: "standard",
  };

  return {
    characters: { Theron: theron },
    playerNames: ["Theron"],
    hostName: "Theron",
    storyStarted: true,
    gameState,
    campaignName: "TDD Goblin Ambush",
    bundles: [buildBundle()],
  };
}
