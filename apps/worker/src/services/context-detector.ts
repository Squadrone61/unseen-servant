import {
  lookupSpell,
  lookupCondition,
  lookupMonster,
  formatSpellForAI,
  formatConditionForAI,
  formatMonsterForAI,
} from "./dnd-api";

const DND_CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
];

const CAST_PATTERNS = [
  /\bcast(?:s|ing)?\s+(.+?)(?:\s+(?:at|on|against|toward|towards)\b|[.!?,]|$)/i,
  /\buse(?:s|ing)?\s+(.+?)(?:\s+(?:on|against)\b|[.!?,]|$)/i,
  /\bactivate(?:s|ing)?\s+(.+?)(?:[.!?,]|$)/i,
];

/** Patterns that suggest a player is initiating combat */
const COMBAT_PATTERNS = [
  /\b(?:attack|fight|strike|hit|stab|slash|shoot|charge)\b/i,
  /\b(?:draw (?:my |their )?(?:sword|weapon|bow|blade))/i,
  /\b(?:roll for initiative|i want to fight)\b/i,
];

/** Extract potential creature names from text (AI narrative or player message) */
const CREATURE_EXTRACT_PATTERNS = [
  // "three robed cultists" → "cultist"
  /\b(?:a|an|the|three|two|four|five|six|several|some|many|few)\s+(?:\w+\s+)?(\w+?)s?\b(?:\s+(?:attack|charge|appear|emerge|approach|lunge|rush|surround))/gi,
  // "attack the goblin" / "fight the orc"
  /\b(?:attack|fight|strike|hit|charge|kill)\s+(?:the\s+)?(\w+?)s?\b/gi,
  // "Goblin" / "Cultist" / "Bandit" appearing as capitalized nouns in AI text (but not character names)
  /(?:^|[.!?\n]\s*)(?:A|An|The|Three|Two|Four|Five|Six|Several|Some)\s+(\w+?)s?\s+(?:appear|emerge|attack|charge|leap|rush|draw|snarl|surround|block)/gim,
];

/** Common SRD monster names to match against (covers most common encounters) */
const SRD_MONSTERS = [
  "aboleth", "acolyte", "adult-black-dragon", "adult-blue-dragon", "adult-brass-dragon",
  "adult-bronze-dragon", "adult-copper-dragon", "adult-gold-dragon", "adult-green-dragon",
  "adult-red-dragon", "adult-silver-dragon", "adult-white-dragon", "air-elemental",
  "animated-armor", "ankheg", "ape", "assassin", "awakened-tree",
  "axe-beak", "azer", "bandit", "bandit-captain", "basilisk", "bat", "bear",
  "berserker", "black-bear", "black-pudding", "blink-dog", "blood-hawk",
  "boar", "bone-devil", "bugbear", "bulette", "camel", "cat",
  "centaur", "chain-devil", "chimera", "chuul", "clay-golem",
  "cloaker", "cloud-giant", "cockatrice", "commoner", "constrictor-snake",
  "couatl", "crab", "crocodile", "cult-fanatic", "cultist",
  "darkmantle", "death-dog", "deer", "deva", "dire-wolf", "djinni",
  "doppelganger", "draft-horse", "dragon-turtle", "dretch", "drider",
  "drow", "druid", "dryad", "duergar", "dust-mephit",
  "eagle", "earth-elemental", "efreeti", "elephant", "elk", "erinyes",
  "ettercap", "ettin", "fire-elemental", "fire-giant", "flameskull",
  "flesh-golem", "flying-snake", "flying-sword", "frog", "frost-giant",
  "gargoyle", "gelatinous-cube", "ghast", "ghost", "ghoul",
  "giant-ape", "giant-bat", "giant-boar", "giant-centipede", "giant-constrictor-snake",
  "giant-crab", "giant-crocodile", "giant-eagle", "giant-elk", "giant-fire-beetle",
  "giant-frog", "giant-goat", "giant-hyena", "giant-lizard", "giant-octopus",
  "giant-owl", "giant-poisonous-snake", "giant-rat", "giant-scorpion", "giant-sea-horse",
  "giant-shark", "giant-spider", "giant-toad", "giant-vulture", "giant-wasp",
  "giant-weasel", "giant-wolf-spider", "gibbering-mouther", "glabrezu",
  "gladiator", "gnoll", "goat", "goblin", "gorgon",
  "gray-ooze", "green-dragon-wyrmling", "green-hag", "grick", "griffon",
  "grimlock", "guard", "guardian-naga", "gynosphinx",
  "half-red-dragon-veteran", "harpy", "hawk", "hell-hound", "hezrou",
  "hill-giant", "hippogriff", "hobgoblin", "homunculus", "horned-devil",
  "hunter-shark", "hydra", "hyena", "ice-devil", "ice-mephit",
  "imp", "invisible-stalker", "iron-golem", "jackal", "killer-whale",
  "knight", "kobold", "kraken", "lamia", "lemure", "lich",
  "lion", "lizard", "lizardfolk", "mage", "magma-mephit",
  "magmin", "mammoth", "manticore", "marilith", "mastiff",
  "medusa", "merfolk", "merrow", "mimic", "minotaur",
  "minotaur-skeleton", "mule", "mummy", "mummy-lord", "nalfeshnee",
  "night-hag", "nightmare", "noble", "nothic", "ochre-jelly",
  "octopus", "ogre", "ogre-zombie", "oni", "orc",
  "orog", "otyugh", "owl", "owlbear", "panther",
  "pegasus", "phase-spider", "pit-fiend", "planetar", "plesiosaurus",
  "poisonous-snake", "polar-bear", "pony", "priest", "pseudodragon",
  "pteranodon", "purple-worm", "quasit", "rakshasa", "rat",
  "raven", "reef-shark", "remorhaz", "rhinoceros", "riding-horse",
  "roc", "roper", "rug-of-smothering", "rust-monster", "saber-toothed-tiger",
  "sahuagin", "salamander", "satyr", "scorpion", "scout",
  "sea-hag", "sea-horse", "shadow", "shambling-mound", "shield-guardian",
  "shrieker", "skeleton", "solar", "specter", "spider",
  "spirit-naga", "spy", "steam-mephit", "stirge", "stone-giant",
  "stone-golem", "storm-giant", "succubus", "swarm-of-bats", "swarm-of-insects",
  "swarm-of-poisonous-snakes", "swarm-of-rats", "swarm-of-ravens",
  "tarrasque", "thug", "tiger", "treant", "tribal-warrior",
  "triceratops", "troll", "tyrannosaurus-rex", "unicorn",
  "vampire", "vampire-spawn", "veteran", "violet-fungus",
  "vrock", "vulture", "warhorse", "warhorse-skeleton", "water-elemental",
  "weasel", "werebear", "wereboar", "wererat", "weretiger", "werewolf",
  "white-dragon-wyrmling", "wight", "will-o-wisp", "winter-wolf",
  "wolf", "worg", "wraith", "wyvern", "xorn",
  "young-black-dragon", "young-blue-dragon", "young-brass-dragon", "young-bronze-dragon",
  "young-copper-dragon", "young-gold-dragon", "young-green-dragon", "young-red-dragon",
  "young-silver-dragon", "young-white-dragon", "zombie",
];

/** Build a lookup map from display name → SRD index for fast matching */
const MONSTER_NAME_MAP = new Map<string, string>();
for (const index of SRD_MONSTERS) {
  // "bandit-captain" → "bandit captain"
  MONSTER_NAME_MAP.set(index.replace(/-/g, " "), index);
}

export interface DetectedReferences {
  spellNames: string[];
  conditionNames: string[];
  monsterNames: string[];
}

/**
 * Detect D&D references in a player message + optional AI context.
 * Uses simple heuristics — no AI calls needed.
 */
export function detectReferences(
  message: string,
  partySpells: string[],
  lastAIMessage?: string,
): DetectedReferences {
  const lowerMessage = message.toLowerCase();
  const spellNames = new Set<string>();
  const conditionNames = new Set<string>();
  const monsterNames = new Set<string>();

  // --- Spell detection ---
  for (const pattern of CAST_PATTERNS) {
    const match = lowerMessage.match(pattern);
    if (match?.[1]) {
      const spellCandidate = match[1].trim();
      if (spellCandidate.length >= 2 && spellCandidate.length <= 40) {
        spellNames.add(spellCandidate);
      }
    }
  }

  for (const spell of partySpells) {
    if (lowerMessage.includes(spell.toLowerCase())) {
      spellNames.add(spell.toLowerCase());
    }
  }

  // --- Condition detection ---
  for (const condition of DND_CONDITIONS) {
    const regex = new RegExp(`\\b${condition}\\b`, "i");
    if (regex.test(lowerMessage)) {
      conditionNames.add(condition);
    }
  }

  // --- Monster detection ---
  // Only try monster detection if the message looks combat-related
  const isCombatRelated = COMBAT_PATTERNS.some((p) => p.test(message));
  const textToScan = lastAIMessage ? `${message} ${lastAIMessage}` : message;

  if (isCombatRelated || lastAIMessage) {
    const lowerScan = textToScan.toLowerCase();
    // Check if any known SRD monster name appears in the text
    for (const [displayName, index] of MONSTER_NAME_MAP) {
      // Word-boundary match to avoid false positives ("bear" in "bearing")
      const regex = new RegExp(`\\b${displayName}s?\\b`, "i");
      if (regex.test(lowerScan)) {
        monsterNames.add(index);
      }
    }
  }

  return {
    spellNames: [...spellNames],
    conditionNames: [...conditionNames],
    monsterNames: [...monsterNames],
  };
}

/**
 * Fetch and format context for detected references.
 * Returns a text block to inject before the user message, or null if nothing found.
 */
export async function buildInjectedContext(
  refs: DetectedReferences,
  kv: KVNamespace,
): Promise<string | null> {
  const parts: string[] = [];

  const spellResults = await Promise.allSettled(
    refs.spellNames.map(async (name) => {
      const spell = await lookupSpell(name, kv);
      return spell ? formatSpellForAI(spell) : null;
    }),
  );

  for (const result of spellResults) {
    if (result.status === "fulfilled" && result.value) {
      parts.push(result.value);
    }
  }

  const conditionResults = await Promise.allSettled(
    refs.conditionNames.map(async (name) => {
      const condition = await lookupCondition(name, kv);
      return condition ? formatConditionForAI(condition) : null;
    }),
  );

  for (const result of conditionResults) {
    if (result.status === "fulfilled" && result.value) {
      parts.push(result.value);
    }
  }

  // Monster lookups (max 5 to avoid excessive API calls)
  const monsterResults = await Promise.allSettled(
    refs.monsterNames.slice(0, 5).map(async (index) => {
      const monster = await lookupMonster(index, kv);
      return monster ? formatMonsterForAI(monster) : null;
    }),
  );

  for (const result of monsterResults) {
    if (result.status === "fulfilled" && result.value) {
      parts.push(result.value);
    }
  }

  if (parts.length === 0) return null;

  return `[System: D&D Reference]\n${parts.join("\n\n")}`;
}
