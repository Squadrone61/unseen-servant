/**
 * migrate-spells-action.ts
 *
 * One-shot migration: reads spells.json and populates EntityEffects.action on
 * every spell that has mechanical combat outcomes (damage, healing, saving throws,
 * conditions applied to targets).
 *
 * Spell classification logic:
 *   1. Attack-roll spells  — description contains "spell attack" (ranged or melee)
 *   2. Save-based damage   — has damageType[] AND savingThrow[] → kind:"save"
 *   3. Save-no-damage      — has savingThrow[] but no damageType, has {condition:X} → kind:"save"
 *   4. Auto-hit damage     — has damageType[], no savingThrow, no "spell attack" → kind:"auto"
 *   5. Healing spells      — description contains healing keyword and damage dice pattern
 *   6. Self-buff spells    — no targets, no damage, no save → leave action undefined
 *
 * The existing effects.modifiers / effects.properties on spells are preserved.
 * action is added as a sibling field.
 *
 * Run: npx tsx scripts/migrate-spells-action.ts
 * Report: .testing/migration-report-spells.md (gitignored)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPELLS_PATH = join(__dirname, "..", "packages", "shared", "src", "data", "spells.json");
const REPORT_PATH = join(__dirname, "..", ".testing", "migration-report-spells.md");

// ---------------------------------------------------------------------------
// Types (inline mirrors of packages/shared/src/types/effects.ts)
// We re-declare locally to avoid tsconfig resolution complexity in scripts.
// ---------------------------------------------------------------------------

type Ability = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
type DamageType =
  | "acid"
  | "bludgeoning"
  | "cold"
  | "fire"
  | "force"
  | "lightning"
  | "necrotic"
  | "piercing"
  | "poison"
  | "psychic"
  | "radiant"
  | "slashing"
  | "thunder";
type ConditionName =
  | "Blinded"
  | "Charmed"
  | "Deafened"
  | "Exhaustion"
  | "Frightened"
  | "Grappled"
  | "Incapacitated"
  | "Invisible"
  | "Paralyzed"
  | "Petrified"
  | "Poisoned"
  | "Prone"
  | "Restrained"
  | "Stunned"
  | "Unconscious";

interface ActionOutcome {
  damage?: Array<{ dice: string; type: DamageType }>;
  healing?: { dice: string };
  tempHp?: { dice: string };
  applyConditions?: Array<{
    name: ConditionName;
    duration?:
      | { type: "concentration" }
      | { type: "duration"; rounds: number }
      | { type: "manual" };
    repeatSave?: "start" | "end";
  }>;
  forcedMovement?: { push?: number; pull?: number; knockProne?: boolean };
  note?: string;
}

interface ActionEffect {
  kind: "attack" | "save" | "auto";
  attack?: {
    bonus: "spell_attack" | "weapon_melee" | "weapon_ranged" | "monster";
    range?: { normal: number; long?: number } | "touch" | "self";
    reach?: number;
  };
  save?: {
    ability: Ability;
    dc: "spell_save_dc" | number;
    onSuccess: "half" | "none" | "negates";
  };
  area?: {
    shape: "sphere" | "cone" | "line" | "cube" | "cylinder";
    size: number;
  };
  targeting?: {
    type: "self" | "creature" | "creatures" | "point" | "area";
    count?: number;
  };
  onHit?: ActionOutcome;
  onMiss?: ActionOutcome;
  onFailedSave?: ActionOutcome;
  onSuccessfulSave?: ActionOutcome;
  upcast?: {
    perLevel?: Partial<ActionOutcome>;
  };
  cantripScaling?: Array<{
    level: number;
    outcome: Partial<ActionOutcome>;
  }>;
  meta?: {
    castingTime?: string;
    components?: string[];
    ritual?: boolean;
    concentration?: boolean;
  };
}

interface SpellEntry {
  name: string;
  description: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  ritual: boolean;
  concentration: boolean;
  classes: string[];
  damageType?: DamageType[];
  savingThrow?: Ability[];
  higherLevels?: string;
  effects?: {
    modifiers?: unknown[];
    properties?: unknown[];
    action?: ActionEffect;
  };
}

// ---------------------------------------------------------------------------
// Hardcoded self-buff / narrative exclusion list
// Spells in this list should NOT get an action even if they have save text,
// because their mechanical effects are fully captured in effects.modifiers/properties
// or they are purely narrative with no combat outcome on a target.
// ---------------------------------------------------------------------------
const SELF_BUFF_EXCLUSIONS = new Set([
  // Protective self-buffs (effects live in modifiers/properties)
  "Shield",
  "Mage Armor",
  "Blade Ward",
  "Sanctuary",
  "Haste",
  "Slow",
  // Buff/debuff with modifiers already captured
  "Bless",
  "Bane",
  "Guidance",
  "Resistance",
  "Thaumaturgy",
  "Prestidigitation",
  // Pure utility / narrative
  "Wish",
  "Simulacrum",
  "Shapechange",
  "True Polymorph",
  "Polymorph",
  "Create Food and Water",
  "Teleport",
  "Teleportation Circle",
  "Gate",
  "Plane Shift",
  "Etherealness",
  "Astral Projection",
  "Legend Lore",
  "Commune",
  "Commune with Nature",
  "Contact Other Plane",
  "Divination",
  "Speak with Dead",
  "Speak with Plants",
  "Speak with Animals",
  "Animal Messenger",
  "Locate Creature",
  "Locate Object",
  "Find the Path",
  "Scrying",
  "Clairvoyance",
  "Arcane Eye",
  "True Seeing",
  "See Invisibility",
  "Detect Magic",
  "Detect Thoughts",
  "Detect Poison and Disease",
  "Detect Evil and Good",
  "Comprehend Languages",
  "Tongues",
  "Illusory Script",
  "Sending",
  "Message",
  "Telepathy",
  "Dream",
  "Nightmare",
  "Modify Memory",
  "Feeblemind",
  "Forcecage",
  "Imprisonment",
  "Sequester",
  "Time Stop",
  "Foresight",
  "Mind Blank",
  "Antimagic Field",
  "Forbiddance",
  "Hallow",
  "Symbol",
  "Glyph of Warding",
  "Alarm",
  "Arcane Lock",
  "Rope Trick",
  "Tiny Hut",
  "Magnificent Mansion",
  "Demiplane",
  "Mordenkainen's Private Sanctum",
  "Private Sanctum",
  "Leomund's Tiny Hut",
  "Leomund's Secret Chest",
  "Secret Chest",
  "Drawmij's Instant Summons",
  "Instant Summons",
  "Continual Flame",
  "Daylight",
  "Darkness",
  "Light",
  "Dancing Lights",
  "Moonbeam", // has damage but also complex ongoing — handled separately
  "Control Weather",
  "Control Water",
  "Control Winds",
  "Move Earth",
  "Earthquake",
  "Tsunami",
  "Mirage Arcane",
  "Hallucinatory Terrain",
  "Programmed Illusion",
  "Major Image",
  "Silent Image",
  "Minor Illusion",
  "Phantasmal Force",
  "Seeming",
  "Disguise Self",
  "Alter Self",
  "Gaseous Form",
  "Spider Climb",
  "Water Walk",
  "Water Breathing",
  "Fly",
  "Levitate",
  "Feather Fall",
  "Jump",
  "Longstrider",
  "Expeditious Retreat",
  "Pass without Trace",
  "Nondetection",
  "Invisibility",
  "Greater Invisibility",
  "Blur",
  "Mirror Image",
  "Hypnotic Pattern",
  "Mislead",
  "Project Image",
  "Shadow of Moil",
  "Clone",
  "Contingency",
  "Magic Circle",
  "Protection from Evil and Good",
  "Protection from Energy",
  "Globe of Invulnerability",
  "Otiluke's Resilient Sphere",
  "Resilient Sphere",
  "Otiluke's Freezing Sphere",
  "Wall of Force",
  "Wall of Stone",
  "Wall of Ice",
  "Wall of Fire", // ongoing area — complex; handled with note
  "Maze",
  "Banishment",
  "Dismissal",
  "Hold Monster", // handled separately as save+condition
  "Compulsion",
  "Dominate Person",
  "Dominate Monster",
  "Dominate Beast",
  "Charm Person",
  "Charm Monster",
  "Enthrall",
  "Suggestion",
  "Mass Suggestion",
  "Command",
  "Calm Emotions",
  "Heroism",
  "Aid",
  "Mass Healing Word",
  "Prayer of Healing",
  "Aura of Life",
  "Aura of Purity",
  "Aura of Vitality",
  "Mass Cure Wounds",
  "Regenerate",
  "Greater Restoration",
  "Lesser Restoration",
  "Remove Curse",
  "Dispel Magic",
  "Counterspell",
  "Nystul's Magic Aura",
  "Magic Aura",
  "Identify",
  "Augury",
  "Enhance Ability",
  "Enlarge/Reduce",
  "Stone Shape",
  "Transmute Rock",
  "Flesh to Stone",
  "Petrification", // not a spell name but guard
  "Reincarnate",
  "Raise Dead",
  "Resurrection",
  "True Resurrection",
  "Revivify",
  "Spare the Dying",
  "Life Transference",
  "Death Ward",
  "Feign Death",
  "Gentle Repose",
  "Speak with Dead",
  "Animate Dead",
  "Create Undead",
  "Finger of Death", // has damage+condition — override handles it
  "Astral Projection",
  "Danse Macabre",
  "Summon Beast",
  "Summon Construct",
  "Summon Elemental",
  "Summon Fey",
  "Summon Fiend",
  "Summon Undead",
  "Summon Woodland Beings",
  "Conjure Animals",
  "Conjure Celestial",
  "Conjure Elemental",
  "Conjure Fey",
  "Conjure Minor Elementals",
  "Conjure Woodland Beings",
  "Unseen Servant",
  "Floating Disk",
  "Tenser's Floating Disk",
  "Find Familiar",
  "Find Steed",
  "Find Greater Steed",
  "Faithful Hound",
  "Mordenkainen's Faithful Hound",
  "Arcane Hand",
  "Bigby's Hand",
  "Tiny Servant",
  "Animate Objects",
  "Awaken",
  "Druidcraft",
  "Elementalism",
  "Mending",
  "Mold Earth",
  "Gust",
  "Shape Water",
  "Control Flames",
  "Magic Stone",
  "Shillelagh",
  "True Strike",
  "Thunderclap",
  "Vicious Mockery", // has damage+save — override
  "Infestation",
  "Toll the Dead",
  "Primal Savagery",
  "Sword Burst",
  "Lightning Lure",
  "Mind Sliver",
  "Create Bonfire",
  "Virtue",
  "Word of Radiance",
  "Sacred Flame",
  "Spare the Dying",
  "Friends",
  "Encode Thoughts",
  "Sapping Sting",
  "Booming Blade",
  "Green-Flame Blade",
  "Produce Flame",
  "Purify Food and Drink",
  "Nathair's Mischief",
  "Tasha's Caustic Brew",
  "Tasha's Mind Whip",
  // Self-targeting buffs with modifiers
  "Barkskin",
  "Stoneskin",
  "Iron Body",
  "Flame Arrows",
  "Fire Shield",
  "Armor of Agathys",
  "Absorb Elements",
  "Warding Wind",
  "Wind Wall",
  "Investiture of Flame",
  "Investiture of Ice",
  "Investiture of Stone",
  "Investiture of Wind",
  "Bones of the Earth",
  "Primordial Ward",
  "Antilife Shell",
  "Call Lightning",
  "Storm Sphere",
  "Vitriolic Sphere",
  "Web",
  "Entangle",
  "Grease",
  "Plant Growth",
  "Spike Growth",
]);

// These spells ARE in the exclusion list but DO have combat actions — manual overrides.
// They will be handled before the exclusion list is checked.
const MANUAL_OVERRIDES: Record<string, ActionEffect> = {
  // Vicious Mockery — save-based psychic damage cantrip (2024 PHB)
  // Failed save: 1d6 psychic damage + disadvantage on next attack roll before end of its next turn.
  // No condition applied — disadvantage on next attack roll is a special one-time penalty.
  "Vicious Mockery": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "1d6", type: "psychic" }],
      note: "Target has Disadvantage on the next attack roll it makes before the end of its next turn.",
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d6", type: "psychic" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d6", type: "psychic" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d6", type: "psychic" }] } },
    ],
  },
  // Infestation — save-based poison cantrip
  Infestation: {
    kind: "save",
    save: { ability: "constitution", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "1d6", type: "poison" }],
      note: "Target moves 5 feet in a random direction (if it can move and isn't Incapacitated).",
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d6", type: "poison" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d6", type: "poison" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d6", type: "poison" }] } },
    ],
  },
  // Toll the Dead — save-based necrotic cantrip
  "Toll the Dead": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "1d8", type: "necrotic" }],
      note: "Damage is 1d12 if the target is missing any of its Hit Points.",
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d8", type: "necrotic" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d8", type: "necrotic" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d8", type: "necrotic" }] } },
    ],
  },
  // Sword Burst — save-based force cantrip
  "Sword Burst": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "sphere", size: 5 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "1d6", type: "force" }],
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d6", type: "force" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d6", type: "force" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d6", type: "force" }] } },
    ],
  },
  // Lightning Lure — save-based lightning cantrip
  "Lightning Lure": {
    kind: "save",
    save: { ability: "strength", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "1d8", type: "lightning" }],
      note: "Target is pulled up to 10 feet toward you.",
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d8", type: "lightning" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d8", type: "lightning" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d8", type: "lightning" }] } },
    ],
  },
  // Mind Sliver — save-based psychic cantrip
  "Mind Sliver": {
    kind: "save",
    save: { ability: "intelligence", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "1d6", type: "psychic" }],
      note: "Target subtracts 1d4 from the next saving throw it makes before the end of your next turn.",
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d6", type: "psychic" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d6", type: "psychic" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d6", type: "psychic" }] } },
    ],
  },
  // Create Bonfire — save-based fire cantrip
  "Create Bonfire": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "point" },
    onFailedSave: {
      damage: [{ dice: "1d8", type: "fire" }],
      note: "Bonfire fills a 5-ft cube. Creatures in it when cast or entering it must make DEX save.",
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d8", type: "fire" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d8", type: "fire" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d8", type: "fire" }] } },
    ],
  },
  // Word of Radiance — save-based radiant cantrip
  "Word of Radiance": {
    kind: "save",
    save: { ability: "constitution", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "sphere", size: 5 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "1d6", type: "radiant" }],
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d6", type: "radiant" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d6", type: "radiant" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d6", type: "radiant" }] } },
    ],
  },
  // Sacred Flame — save-based radiant cantrip
  "Sacred Flame": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "1d8", type: "radiant" }],
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d8", type: "radiant" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d8", type: "radiant" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d8", type: "radiant" }] } },
    ],
  },
  // Thunderclap — save-based thunder cantrip
  Thunderclap: {
    kind: "save",
    save: { ability: "constitution", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "sphere", size: 5 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "1d6", type: "thunder" }],
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d6", type: "thunder" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d6", type: "thunder" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d6", type: "thunder" }] } },
    ],
  },
  // Sapping Sting — save-based necrotic cantrip
  "Sapping Sting": {
    kind: "save",
    save: { ability: "constitution", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "1d4", type: "necrotic" }],
      applyConditions: [{ name: "Prone", duration: { type: "duration", rounds: 1 } }],
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d4", type: "necrotic" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d4", type: "necrotic" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d4", type: "necrotic" }] } },
    ],
  },
  // Booming Blade — melee spell attack, thunder on move
  "Booming Blade": {
    kind: "attack",
    attack: { bonus: "weapon_melee", range: "touch", reach: 5 },
    targeting: { type: "creature" },
    onHit: {
      note: "Weapon damage + thunder sheath (1d8 thunder if target moves 5+ ft). At level 5: +1d8 hit, 2d8 move. Level 11: 2d8/3d8. Level 17: 3d8/4d8.",
    },
    cantripScaling: [
      { level: 5, outcome: { note: "Extra 1d8 thunder on hit; 2d8 thunder if target moves." } },
      { level: 11, outcome: { note: "Extra 2d8 thunder on hit; 3d8 thunder if target moves." } },
      { level: 17, outcome: { note: "Extra 3d8 thunder on hit; 4d8 thunder if target moves." } },
    ],
  },
  // Green-Flame Blade — melee spell attack, fire splash
  "Green-Flame Blade": {
    kind: "attack",
    attack: { bonus: "weapon_melee", range: "touch", reach: 5 },
    targeting: { type: "creature" },
    onHit: {
      note: "Weapon damage + fire leaps to second creature within 5 ft (spellcasting mod fire damage). Level 5: +1d8 hit, 1d8+mod second. Level 11: 2d8/2d8+mod. Level 17: 3d8/3d8+mod.",
    },
    cantripScaling: [
      {
        level: 5,
        outcome: { note: "Extra 1d8 fire on hit; 1d8 + spellcasting mod to second creature." },
      },
      {
        level: 11,
        outcome: { note: "Extra 2d8 fire on hit; 2d8 + spellcasting mod to second creature." },
      },
      {
        level: 17,
        outcome: { note: "Extra 3d8 fire on hit; 3d8 + spellcasting mod to second creature." },
      },
    ],
  },
  // Primal Savagery — melee spell attack (no spell attack roll for ranged, this is melee)
  "Primal Savagery": {
    kind: "attack",
    attack: { bonus: "spell_attack", range: "touch", reach: 5 },
    targeting: { type: "creature" },
    onHit: {
      damage: [{ dice: "1d10", type: "acid" }],
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d10", type: "acid" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d10", type: "acid" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d10", type: "acid" }] } },
    ],
  },
  // Produce Flame — ranged spell attack (optional — cantrip)
  "Produce Flame": {
    kind: "attack",
    attack: { bonus: "spell_attack", range: { normal: 60 } },
    targeting: { type: "creature" },
    onHit: {
      damage: [{ dice: "1d8", type: "fire" }],
    },
    cantripScaling: [
      { level: 5, outcome: { damage: [{ dice: "2d8", type: "fire" }] } },
      { level: 11, outcome: { damage: [{ dice: "3d8", type: "fire" }] } },
      { level: 17, outcome: { damage: [{ dice: "4d8", type: "fire" }] } },
    ],
  },
  // Tasha's Mind Whip — save-based psychic
  "Tasha's Mind Whip": {
    kind: "save",
    save: { ability: "intelligence", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "3d6", type: "psychic" }],
      note: "Target can't take a reaction until the end of its next turn, and on its next turn it must choose between moving or taking an action/bonus action.",
    },
    upcast: {
      perLevel: { note: "Target one additional creature per spell slot level above 2nd." },
    },
  },
  // Tasha's Caustic Brew — save-based acid line
  "Tasha's Caustic Brew": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "line", size: 30 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "2d4", type: "acid" }],
      note: "Target is coated in acid for 1 minute; takes 2d4 acid damage at the start of each turn until it or ally uses action to scrape off acid.",
    },
    upcast: {
      perLevel: { damage: [{ dice: "2d4", type: "acid" }] },
    },
  },
  // Nathair's Mischief — save-based, complex effects
  "Nathair's Mischief": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "cube", size: 20 },
    targeting: { type: "area" },
    onFailedSave: {
      note: "Roll d4: 1=blinded, 2=prone+poisoned, 3=poisoned, 4=speed 0. Effect lasts until start of your next turn.",
    },
  },
  // Moonbeam — save-based radiant beam
  Moonbeam: {
    kind: "save",
    save: { ability: "constitution", dc: "spell_save_dc", onSuccess: "half" },
    area: { shape: "cylinder", size: 5 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "2d10", type: "radiant" }],
    },
    onSuccessfulSave: {
      damage: [{ dice: "2d10", type: "radiant" }],
      note: "Half damage on success.",
    },
    upcast: {
      perLevel: { damage: [{ dice: "2d10", type: "radiant" }] },
    },
    meta: { concentration: true },
  },
  // Hold Monster — like Hold Person but any creature
  "Hold Monster": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Paralyzed",
          duration: { type: "concentration" },
          repeatSave: "end",
        },
      ],
    },
    upcast: {
      perLevel: { note: "Target one additional creature per spell slot level above 5th." },
    },
    meta: { concentration: true },
  },
  // Finger of Death — save-based necrotic + zombie effect
  "Finger of Death": {
    kind: "save",
    save: { ability: "constitution", dc: "spell_save_dc", onSuccess: "half" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "7d8+30", type: "necrotic" }],
      note: "If target dies from this spell, it rises as a zombie under your control at the start of your next turn.",
    },
    onSuccessfulSave: {
      damage: [{ dice: "7d8+30", type: "necrotic" }],
      note: "Half damage on success.",
    },
  },
  // Call Lightning — save-based lightning
  "Call Lightning": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "half" },
    targeting: { type: "point" },
    onFailedSave: {
      damage: [{ dice: "3d10", type: "lightning" }],
    },
    onSuccessfulSave: {
      damage: [{ dice: "3d10", type: "lightning" }],
      note: "Half damage on success.",
    },
    upcast: {
      perLevel: { damage: [{ dice: "1d10", type: "lightning" }] },
    },
    meta: { concentration: true },
  },
  // Storm Sphere — save-based thunder area + lightning attack
  "Storm Sphere": {
    kind: "save",
    save: { ability: "strength", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "sphere", size: 20 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "2d6", type: "thunder" }],
      note: "Also allows ranged spell attack (2d6 lightning) as bonus action each turn.",
    },
    upcast: {
      perLevel: { damage: [{ dice: "1d6", type: "thunder" }] },
    },
    meta: { concentration: true },
  },
  // Vitriolic Sphere — save-based acid
  "Vitriolic Sphere": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "half" },
    area: { shape: "sphere", size: 20 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "10d4", type: "acid" }],
      note: "On failed save, target also takes 5d4 acid damage at end of its next turn.",
    },
    onSuccessfulSave: {
      damage: [{ dice: "5d4", type: "acid" }],
      note: "Half damage on success.",
    },
    upcast: {
      perLevel: { damage: [{ dice: "2d4", type: "acid" }] },
    },
  },
  // Web — restrain on failed save
  Web: {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "cube", size: 20 },
    targeting: { type: "area" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Restrained",
          duration: { type: "concentration" },
          repeatSave: "end",
        },
      ],
    },
    meta: { concentration: true },
  },
  // Entangle — restrain on failed save
  Entangle: {
    kind: "save",
    save: { ability: "strength", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "sphere", size: 20 },
    targeting: { type: "area" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Restrained",
          duration: { type: "concentration" },
          repeatSave: "end",
        },
      ],
    },
    meta: { concentration: true },
  },
  // Grease — prone on failed save
  Grease: {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "sphere", size: 10 },
    targeting: { type: "area" },
    onFailedSave: {
      applyConditions: [{ name: "Prone" }],
    },
  },
  // Spike Growth — no save, difficult terrain + damage on entry
  "Spike Growth": {
    kind: "auto",
    area: { shape: "sphere", size: 20 },
    targeting: { type: "area" },
    onHit: {
      damage: [{ dice: "2d4", type: "piercing" }],
      note: "Per 5 ft moved through the area. No save. Difficult terrain for duration.",
    },
    meta: { concentration: true },
  },
  // Banishment — save-based banish
  Banishment: {
    kind: "save",
    save: { ability: "charisma", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      note: "Target banished to harmless demiplane while concentration lasts. If concentration ends (up to 1 min), target returns. If maintained full minute, target is permanently banished.",
      applyConditions: [
        {
          name: "Incapacitated",
          duration: { type: "concentration" },
        },
      ],
    },
    upcast: {
      perLevel: { note: "Target one additional creature per spell slot level above 4th." },
    },
    meta: { concentration: true },
  },
  // Dominate Person — save-based charm
  "Dominate Person": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Charmed",
          duration: { type: "concentration" },
          repeatSave: "end",
        },
      ],
      note: "You control the charmed creature's actions telepathically. Target repeats save each time it takes damage.",
    },
    meta: { concentration: true },
  },
  // Dominate Beast — save-based charm
  "Dominate Beast": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Charmed",
          duration: { type: "concentration" },
          repeatSave: "end",
        },
      ],
      note: "You control the charmed beast's actions telepathically. Target repeats save each time it takes damage.",
    },
    meta: { concentration: true },
  },
  // Dominate Monster — save-based charm
  "Dominate Monster": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Charmed",
          duration: { type: "concentration" },
          repeatSave: "end",
        },
      ],
      note: "You control the charmed creature (any type) telepathically. Target repeats save each time it takes damage.",
    },
    meta: { concentration: true },
  },
  // Charm Person — save-based charm
  "Charm Person": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Charmed",
          duration: { type: "duration", rounds: 10 },
          repeatSave: "end",
        },
      ],
      note: "Charm lasts 1 hour or until target is harmed. Target knows it was charmed when spell ends.",
    },
    upcast: {
      perLevel: { note: "Target one additional creature per spell slot level above 1st." },
    },
  },
  // Charm Monster — save-based charm
  "Charm Monster": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Charmed",
          duration: { type: "duration", rounds: 10 },
          repeatSave: "end",
        },
      ],
      note: "Charm lasts 1 hour. Target knows it was charmed when spell ends.",
    },
    upcast: {
      perLevel: { note: "Target one additional creature per spell slot level above 4th." },
    },
  },
  // Command — save-based command
  Command: {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      note: "Target follows a one-word command on its next turn: Approach, Drop, Flee, Grovel, Halt.",
    },
    upcast: {
      perLevel: { note: "Target one additional creature per spell slot level above 1st." },
    },
  },
  // Suggestion — save-based enchantment
  Suggestion: {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      note: "Target pursues suggested course of action (up to 8 hours). Concentration.",
    },
    meta: { concentration: true },
  },
  // Mass Suggestion — same but multi-target
  "Mass Suggestion": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creatures", count: 12 },
    onFailedSave: {
      note: "Targets pursue suggested course of action (up to 24 hours). No concentration.",
    },
  },
  // Calm Emotions — save-based pacify
  "Calm Emotions": {
    kind: "save",
    save: { ability: "charisma", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "sphere", size: 20 },
    targeting: { type: "area" },
    onFailedSave: {
      note: "Suppress Charmed or Frightened condition, OR make target indifferent toward creatures it is hostile to (until harmed). Concentration.",
    },
    meta: { concentration: true },
  },
  // Compulsion — save-based forced movement
  Compulsion: {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creatures", count: 4 },
    onFailedSave: {
      note: "You can use your action to designate a direction; affected creatures must move toward it on their turns. Concentration up to 1 minute.",
    },
    meta: { concentration: true },
  },
  // Enthrall — save-based focus
  Enthrall: {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creatures" },
    onFailedSave: {
      note: "Affected creatures have disadvantage on Perception checks to notice other creatures. Lasts 1 minute.",
    },
  },
  // Hypnotic Pattern — save-based Incapacitated
  "Hypnotic Pattern": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    area: { shape: "cube", size: 30 },
    targeting: { type: "area" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Incapacitated",
          duration: { type: "concentration" },
        },
      ],
      note: "Incapacitated creatures are also charmed and have 0 speed. Effect ends if target takes damage or another creature uses action to shake it.",
    },
    meta: { concentration: true },
  },
  // Feeblemind — save-based INT/CHA damage
  Feeblemind: {
    kind: "save",
    save: { ability: "intelligence", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      damage: [{ dice: "4d6", type: "psychic" }],
      note: "Target's Intelligence and Charisma become 1. Target can't cast spells, activate magic items, understand language, or communicate intelligibly. Repeats save every 30 days.",
    },
  },
  // Modify Memory — save-based memory alteration
  "Modify Memory": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creature" },
    onFailedSave: {
      applyConditions: [
        {
          name: "Charmed",
          duration: { type: "duration", rounds: 1 },
        },
      ],
      note: "If charmed, you alter one memory from past 24 hours. At higher levels: 1 day (3), 7 days (4), 30 days (5), any time (6+).",
    },
    meta: { concentration: true },
  },
  // Heroism — temp HP buff (healing-adjacent)
  Heroism: {
    kind: "auto",
    targeting: { type: "creature" },
    onHit: {
      note: "Target gains immunity to Frightened and gains temp HP equal to your spellcasting ability modifier at start of each turn while concentration lasts.",
    },
    meta: { concentration: true },
  },
  // Aid — temp HP/max HP buff
  Aid: {
    kind: "auto",
    targeting: { type: "creatures", count: 3 },
    onHit: {
      tempHp: { dice: "0" },
      note: "Each target's max HP and current HP increase by 5 (not temp HP — permanent for duration). At higher levels: +5 per slot level above 2nd.",
    },
    upcast: {
      perLevel: { note: "Each target's HP max increases by additional 5." },
    },
  },
  // Flame Arrows — ongoing buff, deals 1d6 fire on ranged hits
  "Flame Arrows": {
    kind: "auto",
    targeting: { type: "self" },
    onHit: {
      note: "Enchants up to 12 pieces of ammunition. Each hit with that ammo deals extra 1d6 fire. Concentration up to 1 hour.",
    },
    meta: { concentration: true },
  },
  // Fire Shield — self-buff with reactive damage
  "Fire Shield": {
    kind: "auto",
    targeting: { type: "self" },
    onHit: {
      note: "Warm version: resistance to cold, creatures hitting you take 2d8 fire. Cold version: resistance to fire, creatures hitting you take 2d8 cold.",
    },
  },
  // Armor of Agathys — temp HP + reactive damage
  "Armor of Agathys": {
    kind: "auto",
    targeting: { type: "self" },
    onHit: {
      tempHp: { dice: "5" },
      note: "Gain 5 temp HP. Creatures hitting you while you have temp HP take 5 cold damage. Higher levels: +5 temp HP and cold damage per slot level above 1st.",
    },
    upcast: {
      perLevel: { tempHp: { dice: "5" } },
    },
  },
  // Life Transference — self-damage, target healing
  "Life Transference": {
    kind: "auto",
    targeting: { type: "creature" },
    onHit: {
      damage: [{ dice: "4d8", type: "necrotic" }],
      healing: { dice: "8d8" },
      note: "You take 4d8 necrotic damage (no save); target regains twice that as HP.",
    },
    upcast: {
      perLevel: { damage: [{ dice: "1d8", type: "necrotic" }] },
    },
  },
  // Danse Macabre — save-based undead command
  "Danse Macabre": {
    kind: "save",
    save: { ability: "wisdom", dc: "spell_save_dc", onSuccess: "negates" },
    targeting: { type: "creatures", count: 5 },
    onFailedSave: {
      note: "Up to 5 small or medium undead make WIS save or are under your control for 1 hour (concentration). Undead attacking: add your spellcasting mod to attack/damage.",
    },
    meta: { concentration: true },
  },
  // Wall of Fire — ongoing area save
  "Wall of Fire": {
    kind: "save",
    save: { ability: "dexterity", dc: "spell_save_dc", onSuccess: "half" },
    area: { shape: "line", size: 60 },
    targeting: { type: "area" },
    onFailedSave: {
      damage: [{ dice: "5d8", type: "fire" }],
      note: "Wall is 60 ft long × 20 ft high × 1 ft thick. Creatures entering or starting turn within 10 ft of opaque side take 5d8 fire.",
    },
    onSuccessfulSave: {
      damage: [{ dice: "5d8", type: "fire" }],
      note: "Half damage on success.",
    },
    upcast: {
      perLevel: { damage: [{ dice: "1d8", type: "fire" }] },
    },
    meta: { concentration: true },
  },
  // Animate Objects — auto attack objects
  "Animate Objects": {
    kind: "auto",
    targeting: { type: "creatures", count: 10 },
    onHit: {
      note: "Up to 10 nonmagical objects animated for 1 minute. Tiny: +8 atk, 1d4+4 dmg. Small: +6 atk, 1d8+2. Medium: +5 atk, 2d6+1. Large: +6 atk, 2d10+2. Huge: +8 atk, 2d12+4.",
    },
    meta: { concentration: true },
  },
};

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract damage dice from description text.
 * Returns the FIRST match found (base damage). Pattern: NdM or NdM+K or NdM-K
 */
function extractDamageDice(description: string): string | null {
  // Look for patterns like "1d6", "8d6", "2d8+5", "3d10", "7d8+30"
  // Priority: look near "damage" keyword first
  const nearDamage = description.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+\w+\s+damage/i);
  if (nearDamage) return nearDamage[1].replace(/\s+/g, "");

  // Fallback: first dice pattern
  const anywhere = description.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/);
  if (anywhere) return anywhere[1].replace(/\s+/g, "");

  return null;
}

/**
 * Extract healing dice from description text.
 * Returns dice string for "regains X hit points" or "heals X"
 */
function extractHealingDice(description: string): string | null {
  // "regains a number of Hit Points equal to 2d8"
  const regains = description.match(/regains[^.]*?(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  if (regains) return regains[1].replace(/\s+/g, "");

  // "heals X hit points"
  const heals = description.match(/heals[^.]*?(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  if (heals) return heals[1].replace(/\s+/g, "");

  // "restores X hit points"
  const restores = description.match(/restores[^.]*?(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  if (restores) return restores[1].replace(/\s+/g, "");

  return null;
}

/**
 * Extract upcast damage dice per level.
 * Returns dice string if found, null otherwise.
 */
function extractUpcastDice(higherLevels: string | undefined): string | null {
  if (!higherLevels) return null;

  // "increases by 8d6 for each spell slot level above 3"
  // "increases by 2d8 for each spell slot level above 1"
  const match = higherLevels.match(/increases by (\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  if (match) return match[1].replace(/\s+/g, "");

  return null;
}

/**
 * Extract cantrip scaling dice from higherLevels text.
 * Returns array of { level, dice } for levels 5, 11, 17.
 * "increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10)"
 */
function extractCantripScaling(
  higherLevels: string | undefined,
  damageType: DamageType,
): Array<{ level: number; outcome: Partial<ActionOutcome> }> | null {
  if (!higherLevels) return null;
  if (!higherLevels.includes("Cantrip Upgrade")) return null;

  // Parse "(2d10)" style captures
  const matches = higherLevels.matchAll(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/g);
  const diceSets: string[] = [];
  for (const m of matches) {
    diceSets.push(m[1].replace(/\s+/g, ""));
  }

  if (diceSets.length < 3) return null;

  return [
    { level: 5, outcome: { damage: [{ dice: diceSets[0], type: damageType }] } },
    { level: 11, outcome: { damage: [{ dice: diceSets[1], type: damageType }] } },
    { level: 17, outcome: { damage: [{ dice: diceSets[2], type: damageType }] } },
  ];
}

/**
 * Parse area shape + size from description text.
 * Returns { shape, size } or null.
 */
function parseArea(
  description: string,
): { shape: "sphere" | "cone" | "line" | "cube" | "cylinder"; size: number } | null {
  // Sphere
  const sphereMatch = description.match(/(\d+)[- ]foot[- ]radius\s+(?:\{rule:)?Sphere/i);
  if (sphereMatch) return { shape: "sphere", size: parseInt(sphereMatch[1]) };

  // Cone
  const coneMatch = description.match(/(\d+)[- ]foot\s+(?:\{rule:)?Cone/i);
  if (coneMatch) return { shape: "cone", size: parseInt(coneMatch[1]) };

  // Line (length × width)
  const lineMatch =
    description.match(/(\d+)[- ]foot[- ]long.*?(?:\{rule:)?Line/i) ||
    description.match(/(\d+)[- ]foot[- ](?:wide\s+)?(?:long\s+)?(?:\{rule:)?Line/i) ||
    description.match(/(\d+)[- ]foot[- ]long.*?line/i);
  if (lineMatch) return { shape: "line", size: parseInt(lineMatch[1]) };

  // Cube
  const cubeMatch = description.match(/(\d+)[- ]foot\s+(?:\{rule:)?Cube/i);
  if (cubeMatch) return { shape: "cube", size: parseInt(cubeMatch[1]) };

  // Cylinder
  const cylinderMatch =
    description.match(/(\d+)[- ]foot[- ]radius.*?(?:\{rule:)?Cylinder/i) ||
    description.match(/(\d+)[- ]foot[- ]radius.*?cylinder/i);
  if (cylinderMatch) return { shape: "cylinder", size: parseInt(cylinderMatch[1]) };

  return null;
}

/**
 * Parse range string into structured attack range.
 */
function parseRange(rangeStr: string): { normal: number; long?: number } | "touch" | "self" | null {
  if (rangeStr.toLowerCase() === "touch") return "touch";
  if (rangeStr.toLowerCase() === "self") return "self";

  const rangedMatch = rangeStr.match(/(\d+)\/(\d+)\s*feet/i);
  if (rangedMatch) return { normal: parseInt(rangedMatch[1]), long: parseInt(rangedMatch[2]) };

  const feetMatch = rangeStr.match(/(\d+)\s*feet/i);
  if (feetMatch) return { normal: parseInt(feetMatch[1]) };

  return null;
}

/**
 * Extract conditions applied by a spell from description {condition:X} tags.
 * Returns array of condition names found.
 */
function extractConditions(description: string): ConditionName[] {
  const VALID_CONDITIONS: ConditionName[] = [
    "Blinded",
    "Charmed",
    "Deafened",
    "Exhaustion",
    "Frightened",
    "Grappled",
    "Incapacitated",
    "Invisible",
    "Paralyzed",
    "Petrified",
    "Poisoned",
    "Prone",
    "Restrained",
    "Stunned",
    "Unconscious",
  ];
  const conditionMap = new Map<string, ConditionName>(
    VALID_CONDITIONS.map((c) => [c.toLowerCase(), c]),
  );
  const matches = description.matchAll(/\{condition:(\w+)/g);
  const found = new Set<ConditionName>();
  for (const m of matches) {
    const normalized = conditionMap.get(m[1].toLowerCase());
    if (normalized) found.add(normalized);
  }
  return Array.from(found);
}

// ---------------------------------------------------------------------------
// Main classification function
// ---------------------------------------------------------------------------

type MigrationOutcome =
  | { status: "populated"; action: ActionEffect }
  | { status: "skipped_self_buff" }
  | { status: "skipped_narrative" }
  | { status: "manual_override"; action: ActionEffect }
  | { status: "no_action_needed" };

function classifySpell(spell: SpellEntry): MigrationOutcome {
  const desc = spell.description;
  const name = spell.name;

  // 1. Check manual overrides first (these take priority over exclusion list)
  if (MANUAL_OVERRIDES[name]) {
    return { status: "manual_override", action: MANUAL_OVERRIDES[name] };
  }

  // 2. Check exclusion list
  if (SELF_BUFF_EXCLUSIONS.has(name)) {
    return { status: "skipped_self_buff" };
  }

  const hasDamageType = spell.damageType && spell.damageType.length > 0;
  const hasSaveType = spell.savingThrow && spell.savingThrow.length > 0;
  const isCantrip = spell.level === 0;
  const damageType = hasDamageType ? spell.damageType![0] : null;
  const saveAbility = hasSaveType ? spell.savingThrow![0] : null;

  // Detect spell attack in description
  const isSpellAttack =
    /make a (ranged|melee) spell attack/i.test(desc) ||
    /ranged spell attack against/i.test(desc) ||
    /melee spell attack against/i.test(desc);

  // Detect healing
  const isHealing =
    /regains?\s+(?:a number of\s+)?(?:\{rule:)?[Hh]it [Pp]oints/i.test(desc) ||
    /heals?\s+\d+d\d+/i.test(desc) ||
    /restores?\s+\d+d\d+\s+hit\s+points/i.test(desc);

  // Detect forced movement
  const isPushed = /pushed?\s+(?:up to\s+)?\d+\s+feet/i.test(desc);
  const isPulled = /pulled?\s+(?:up to\s+)?\d+\s+feet/i.test(desc);

  // ----- CASE A: Healing spells -----
  if (!hasDamageType && !hasSaveType && isHealing) {
    const healingDice = extractHealingDice(desc);
    if (!healingDice) {
      return { status: "skipped_narrative" };
    }
    const action: ActionEffect = {
      kind: "auto",
      targeting: { type: "creature" },
      onHit: {
        healing: { dice: healingDice },
      },
    };
    // Upcast
    const upcastDice = extractUpcastDice(spell.higherLevels);
    if (upcastDice) {
      action.upcast = { perLevel: { healing: { dice: upcastDice } } };
    }
    return { status: "populated", action };
  }

  // ----- CASE B: Spell attack roll + damage -----
  if (hasDamageType && isSpellAttack && !hasSaveType) {
    const damageDice = extractDamageDice(desc);
    if (!damageDice) {
      return { status: "skipped_narrative" };
    }

    const rangeVal = parseRange(spell.range);
    const isMelee = /melee spell attack/i.test(desc);

    // Check for conditions applied on hit (e.g. Ray of Sickness → Poisoned)
    const hitConditions = extractConditions(desc);

    const onHitOutcome: ActionOutcome = {
      damage: [{ dice: damageDice, type: damageType! }],
    };
    if (hitConditions.length > 0) {
      onHitOutcome.applyConditions = hitConditions.map((c) => ({
        name: c,
        duration: { type: "duration" as const, rounds: 1 },
      }));
    }

    const action: ActionEffect = {
      kind: "attack",
      attack: {
        bonus: "spell_attack",
        range: rangeVal ?? undefined,
        ...(isMelee ? { reach: 5 } : {}),
      },
      targeting: { type: "creature" },
      onHit: onHitOutcome,
    };

    // Cantrip scaling
    if (isCantrip) {
      const scaling = extractCantripScaling(spell.higherLevels, damageType!);
      if (scaling) action.cantripScaling = scaling;
    } else {
      // Upcast
      const upcastDice = extractUpcastDice(spell.higherLevels);
      if (upcastDice) {
        action.upcast = { perLevel: { damage: [{ dice: upcastDice, type: damageType! }] } };
      }
    }

    return { status: "populated", action };
  }

  // ----- CASE C: Save-based damage -----
  if (hasDamageType && hasSaveType) {
    const damageDice = extractDamageDice(desc);
    if (!damageDice) {
      return { status: "skipped_narrative" };
    }

    // Determine success behavior: "half" for most AoE damage, "negates" for single-target where save prevents all
    const isHalfOnSuccess =
      /half as much damage on a successful/i.test(desc) ||
      /half damage on a success/i.test(desc) ||
      /half as much on a success/i.test(desc);

    const onSuccessBehavior = isHalfOnSuccess ? "half" : "negates";

    // Detect area
    const area = parseArea(desc);

    // Check for additional conditions
    const conditions = extractConditions(desc);

    // Check for forced movement
    let forcedMovement: ActionOutcome["forcedMovement"] | undefined;
    if (isPushed) {
      const pushMatch = desc.match(/pushed?\s+(?:up to\s+)?(\d+)\s+feet/i);
      if (pushMatch) forcedMovement = { push: parseInt(pushMatch[1]) };
    }
    if (isPulled) {
      const pullMatch = desc.match(/pulled?\s+(?:up to\s+)?(\d+)\s+feet/i);
      if (pullMatch) forcedMovement = { ...forcedMovement, pull: parseInt(pullMatch[1]) };
    }

    const onFailedSave: ActionOutcome = {
      damage: [{ dice: damageDice, type: damageType! }],
    };
    if (conditions.length > 0) {
      // Condition applied on failed save — determine duration
      const isConcentration = spell.concentration;
      onFailedSave.applyConditions = conditions.map((c) => ({
        name: c,
        duration: isConcentration
          ? { type: "concentration" as const }
          : { type: "duration" as const, rounds: 1 },
      }));
    }
    if (forcedMovement) onFailedSave.forcedMovement = forcedMovement;

    const action: ActionEffect = {
      kind: "save",
      save: {
        ability: saveAbility!,
        dc: "spell_save_dc",
        onSuccess: onSuccessBehavior,
      },
      ...(area ? { area } : {}),
      targeting: area ? { type: "area" as const } : { type: "creature" as const },
      onFailedSave,
    };

    // onSuccessfulSave for half-damage
    if (isHalfOnSuccess) {
      action.onSuccessfulSave = {
        damage: [{ dice: damageDice, type: damageType! }],
        note: "Half damage on success.",
      };
    }

    // Upcast
    if (!isCantrip) {
      const upcastDice = extractUpcastDice(spell.higherLevels);
      if (upcastDice) {
        action.upcast = { perLevel: { damage: [{ dice: upcastDice, type: damageType! }] } };
      }
    } else {
      const scaling = extractCantripScaling(spell.higherLevels, damageType!);
      if (scaling) action.cantripScaling = scaling;
    }

    return { status: "populated", action };
  }

  // ----- CASE D: Save-based condition spell (no damage type) -----
  if (!hasDamageType && hasSaveType) {
    const conditions = extractConditions(desc);

    if (conditions.length === 0) {
      // Has a save but no conditions — check for healing
      if (isHealing) {
        const healingDice = extractHealingDice(desc);
        if (healingDice) {
          const action: ActionEffect = {
            kind: "auto",
            targeting: { type: "creature" },
            onHit: { healing: { dice: healingDice } },
          };
          const upcastDice = extractUpcastDice(spell.higherLevels);
          if (upcastDice) {
            action.upcast = { perLevel: { healing: { dice: upcastDice } } };
          }
          return { status: "populated", action };
        }
      }
      // Save with no conditions or damage — likely a complex spell, use note
      return { status: "skipped_narrative" };
    }

    // Determine if repeat save text present
    const hasRepeatSave = /at the (?:start|end) of each of its turns/i.test(desc);
    const repeatSaveType = /at the end/i.test(desc) ? "end" : "start";

    // Determine duration
    const isConc = spell.concentration;
    const conditionDuration = isConc
      ? { type: "concentration" as const }
      : { type: "duration" as const, rounds: 1 };

    const conditionEntries = conditions.map((c) => ({
      name: c,
      duration: conditionDuration,
      ...(hasRepeatSave ? { repeatSave: repeatSaveType as "start" | "end" } : {}),
    }));

    // Forced movement
    let forcedMovement: ActionOutcome["forcedMovement"] | undefined;
    if (isPushed) {
      const pushMatch = desc.match(/pushed?\s+(?:up to\s+)?(\d+)\s+feet/i);
      if (pushMatch) forcedMovement = { push: parseInt(pushMatch[1]) };
    }
    if (isPulled) {
      const pullMatch = desc.match(/pulled?\s+(?:up to\s+)?(\d+)\s+feet/i);
      if (pullMatch) forcedMovement = { ...forcedMovement, pull: parseInt(pullMatch[1]) };
    }

    const onFailedSave: ActionOutcome = {
      applyConditions: conditionEntries,
    };
    if (forcedMovement) onFailedSave.forcedMovement = forcedMovement;

    // Area detection
    const area = parseArea(desc);

    const action: ActionEffect = {
      kind: "save",
      save: {
        ability: saveAbility!,
        dc: "spell_save_dc",
        onSuccess: "negates",
      },
      ...(area ? { area } : {}),
      targeting: area ? { type: "area" as const } : { type: "creature" as const },
      onFailedSave,
    };

    // Upcast
    if (spell.higherLevels) {
      const upcastMatch = spell.higherLevels.match(/one additional.*?(?:creature|humanoid)/i);
      if (upcastMatch) {
        action.upcast = {
          perLevel: { note: `Target one additional creature per slot level above ${spell.level}.` },
        };
      }
    }

    return { status: "populated", action };
  }

  // ----- CASE E: Auto-hit damage (no save, no spell attack, has damageType) -----
  if (hasDamageType && !hasSaveType && !isSpellAttack) {
    const damageDice = extractDamageDice(desc);
    if (!damageDice) {
      return { status: "skipped_narrative" };
    }

    const action: ActionEffect = {
      kind: "auto",
      targeting: { type: "creature" },
      onHit: {
        damage: [{ dice: damageDice, type: damageType! }],
      },
    };

    // Special case: Magic Missile — 3 darts
    if (name === "Magic Missile") {
      action.onHit!.note =
        "Fires 3 darts by default (1 dart each, directed freely). Each dart deals 1d4+1 force separately.";
      action.upcast = { perLevel: { note: "One additional dart per slot level above 1st." } };
    } else if (!isCantrip) {
      const upcastDice = extractUpcastDice(spell.higherLevels);
      if (upcastDice) {
        action.upcast = { perLevel: { damage: [{ dice: upcastDice, type: damageType! }] } };
      }
    } else {
      const scaling = extractCantripScaling(spell.higherLevels, damageType!);
      if (scaling) action.cantripScaling = scaling;
    }

    return { status: "populated", action };
  }

  // ----- CASE F: No signals at all — check for healing -----
  if (!hasDamageType && !hasSaveType && !isSpellAttack) {
    if (isHealing) {
      const healingDice = extractHealingDice(desc);
      if (healingDice) {
        const action: ActionEffect = {
          kind: "auto",
          targeting: { type: "creature" },
          onHit: {
            healing: { dice: healingDice },
          },
        };
        const upcastDice = extractUpcastDice(spell.higherLevels);
        if (upcastDice) {
          action.upcast = { perLevel: { healing: { dice: upcastDice } } };
        }
        return { status: "populated", action };
      }
    }
    return { status: "no_action_needed" };
  }

  return { status: "no_action_needed" };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ReportEntry {
  name: string;
  level: number;
  status: string;
  details?: string;
}

function main() {
  const raw = readFileSync(SPELLS_PATH, "utf-8");
  const spells: SpellEntry[] = JSON.parse(raw);

  const report: ReportEntry[] = [];
  let populated = 0;
  let skippedSelfBuff = 0;
  let skippedNarrative = 0;
  let manualOverride = 0;
  let noActionNeeded = 0;
  let alreadyHasAction = 0;

  const result = spells.map((spell) => {
    // Skip if action already populated
    if (spell.effects?.action) {
      alreadyHasAction++;
      report.push({ name: spell.name, level: spell.level, status: "already_has_action" });
      return spell;
    }

    const outcome = classifySpell(spell);

    switch (outcome.status) {
      case "populated":
      case "manual_override": {
        populated++;
        if (outcome.status === "manual_override") manualOverride++;
        report.push({
          name: spell.name,
          level: spell.level,
          status: outcome.status,
          details: outcome.action.kind,
        });
        return {
          ...spell,
          effects: {
            ...spell.effects,
            action: outcome.action,
          },
        };
      }
      case "skipped_self_buff":
        skippedSelfBuff++;
        report.push({ name: spell.name, level: spell.level, status: "skipped_self_buff" });
        return spell;
      case "skipped_narrative":
        skippedNarrative++;
        report.push({ name: spell.name, level: spell.level, status: "skipped_narrative" });
        return spell;
      case "no_action_needed":
        noActionNeeded++;
        report.push({ name: spell.name, level: spell.level, status: "no_action_needed" });
        return spell;
    }
  });

  // Write back to spells.json
  writeFileSync(SPELLS_PATH, JSON.stringify(result, null, 2) + "\n", "utf-8");

  // Write report
  mkdirSync(join(__dirname, "..", ".testing"), { recursive: true });

  const reportLines = [
    "# Spell Action Migration Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Category | Count |`,
    `|---|---|`,
    `| Populated (auto) | ${populated - manualOverride} |`,
    `| Populated (manual override) | ${manualOverride} |`,
    `| **Total populated** | **${populated}** |`,
    `| Skipped (self-buff/narrative exclusion) | ${skippedSelfBuff} |`,
    `| Skipped (could not extract dice) | ${skippedNarrative} |`,
    `| No action needed (pure utility) | ${noActionNeeded} |`,
    `| Already had action | ${alreadyHasAction} |`,
    `| **Total spells** | **${spells.length}** |`,
    "",
    "## Per-Spell Detail",
    "",
    "| Name | Level | Status | Details |",
    "|---|---|---|---|",
    ...report.map((r) => `| ${r.name} | ${r.level} | ${r.status} | ${r.details ?? ""} |`),
  ];

  writeFileSync(REPORT_PATH, reportLines.join("\n") + "\n", "utf-8");

  console.log("Migration complete.");
  console.log(`  Total spells:       ${spells.length}`);
  console.log(`  Populated:          ${populated} (${manualOverride} manual overrides)`);
  console.log(`  Skipped self-buff:  ${skippedSelfBuff}`);
  console.log(`  Skipped narrative:  ${skippedNarrative}`);
  console.log(`  No action needed:   ${noActionNeeded}`);
  console.log(`  Already had action: ${alreadyHasAction}`);
  console.log(`  Report: ${REPORT_PATH}`);
}

main();
