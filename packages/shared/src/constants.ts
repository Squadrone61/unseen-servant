export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS_PER_ROOM = 6;
export const DEFAULT_MAX_TOKENS = 1024;

// === Pacing & Encounter Length Guidance ===
export const DM_PACING_PROFILES: Record<string, string> = {
  "story-heavy":
    "Prioritize roleplay, NPC interactions, world-building. Combat is rare and meaningful — every fight serves the narrative. Lean into dialogue, exploration, character moments.",
  balanced:
    "Mix combat, roleplay, and exploration roughly equally. Let player actions guide which pillar gets focus each scene.",
  "combat-heavy":
    "Drive toward encounters and action. Keep exploration/dialogue focused and efficient — use them to set up the next challenge.",
};

export const DM_ENCOUNTER_LENGTHS: Record<string, string> = {
  quick:
    "Resolve combats in 3-4 rounds. Fewer, stronger enemies. Keep initiative moving fast — no drawn-out turns.",
  standard: "Normal D&D combat length (4-6 rounds). Standard enemy count and tactics.",
  epic: "Extended encounters with waves, phase transitions, environmental shifts. 6-10+ rounds for boss fights. Multi-stage bosses encouraged.",
};
