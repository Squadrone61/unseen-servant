/**
 * Fixture: Zara — Tiefling Warlock 5 / Fiend, peaceful (no combat).
 * Spell list: Hex, Armor of Agathys, Counterspell. Cantrips: Eldritch Blast, Minor Illusion.
 * Notably DOES NOT KNOW: Wish, Disintegrate, Fireball.
 */
import { buildCharacter } from "@unseen-servant/shared/builders";
import { makeWarlockBuilderState } from "@unseen-servant/shared/test-helpers";
import type { FixtureWorld } from "../harness/types.js";

export function buildFixture(): FixtureWorld {
  const { state, inventory, currency, traits } = makeWarlockBuilderState();
  const { character } = buildCharacter(state, { inventory, currency, traits });

  return {
    characters: { Zara: character },
    playerNames: ["Zara"],
    hostName: "Zara",
    storyStarted: true,
    gameState: {
      encounter: null,
      eventLog: [],
      pacingProfile: "balanced",
      encounterLength: "standard",
    },
  };
}
