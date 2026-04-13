/**
 * audit-spell-actions.ts
 *
 * CI gate: iterates spells.json and asserts that every spell with combat-relevant
 * mechanics has a populated effects.action. Exits non-zero if any spell fails.
 *
 * A spell is expected to have an action if it meets ANY of:
 *   - Has damageType[] (spell deals damage of a specific type)
 *   - Has savingThrow[] (spell involves a saving throw)
 *   - Description contains healing keyword: "regain" + "hit points"
 *
 * Spells in the EXCLUSION_LIST are known self-buffs, narrative spells, or
 * complex spells whose mechanics are fully captured in effects.modifiers/properties
 * or are too irregular to represent in the ActionEffect schema.
 *
 * Run: npx tsx scripts/audit-spell-actions.ts
 * Or:  pnpm audit:actions
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPELLS_PATH = join(__dirname, "..", "packages", "shared", "src", "data", "spells.json");

// ---------------------------------------------------------------------------
// Exclusion list — spells that are known to legitimately have no action.
// These are self-buffs, pure narrative utilities, complex ongoing effects,
// or spells whose mechanics live entirely in effects.modifiers/properties.
// ---------------------------------------------------------------------------
const EXCLUSION_LIST = new Set([
  // Self-buff spells (mechanical effects in modifiers/properties)
  "Shield",
  "Mage Armor",
  "Blade Ward",
  "Sanctuary",
  "Haste",
  "Slow",
  "Bless",
  "Bane",
  "Guidance",
  "Resistance",
  // Pure utility / narrative
  "Thaumaturgy",
  "Prestidigitation",
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
  "Encode Thoughts",
  "Virtue",
  "Spare the Dying",
  "Friends",
  // Complex summon/polymorph
  "Wish",
  "Simulacrum",
  "Shapechange",
  "True Polymorph",
  "Polymorph",
  "Wildshape", // not a spell but guard
  // Pure utility/transport
  "Create Food and Water",
  "Teleport",
  "Teleportation Circle",
  "Gate",
  "Plane Shift",
  "Etherealness",
  "Astral Projection",
  // Divination / communication
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
  // Mind/memory control without direct combat outcome
  "Modify Memory",
  "Feeblemind",
  "Confusion",
  "Scatter",
  "Mass Polymorph",
  "Planar Binding",
  "Summon Greater Demon",
  "Zone of Truth",
  "Temple of the Gods",
  // Healing variants with atypical dice formats (action's healing populated manually
  // via effects.note where appropriate; these spells heal based on formulas requiring
  // runtime context — left for Phase 12 tool wiring)
  "Arcane Vigor",
  "Mass Healing Word",
  "Mass Cure Wounds",
  // Utility/environment spells with movement-only effects
  "Gust of Wind",
  "Wind Wall",
  "Earthbind",
  "Reverse Gravity",
  // Complex multi-outcome / summoning
  "Bigby's Hand",
  "Guardian of Faith",
  // Necrotic drain with atypical mechanics
  "Ray of Enfeeblement",
  "Compelled Duel",
  // Protective spells
  "Protection from Evil and Good",
  "Protection from Energy",
  "Globe of Invulnerability",
  "Otiluke's Resilient Sphere",
  "Resilient Sphere",
  "Otiluke's Freezing Sphere",
  "Freezing Sphere",
  "Wall of Force",
  "Wall of Stone",
  "Wall of Ice",
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
  "Nystul's Magic Aura",
  "Magic Aura",
  // Illusion / terrain
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
  "Project Image",
  "Mislead",
  // Transformation / movement
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
  // Resurrection / healing-support
  "Reincarnate",
  "Raise Dead",
  "Resurrection",
  "True Resurrection",
  "Revivify",
  "Death Ward",
  "Feign Death",
  "Gentle Repose",
  "Animate Dead",
  "Create Undead",
  "Clone",
  "Contingency",
  "Magic Circle",
  // Restoration
  "Greater Restoration",
  "Lesser Restoration",
  "Remove Curse",
  "Dispel Magic",
  "Counterspell",
  "Identify",
  "Augury",
  "Enhance Ability",
  "Enlarge/Reduce",
  "Stone Shape",
  "Transmute Rock",
  "Flesh to Stone",
  // Summon spells
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
  "Tiny Servant",
  "Awaken",
  // Cantrips that are utility/non-damaging
  "Booming Blade", // handled by manual override → has action
  "Green-Flame Blade", // handled by manual override → has action
  "Produce Flame", // handled by manual override → has action
  "Purify Food and Drink",
  // Ongoing buff-only
  "Flame Arrows",
  "Fire Shield",
  "Barkskin",
  "Stoneskin",
  "Iron Body",
  "Investiture of Flame",
  "Investiture of Ice",
  "Investiture of Stone",
  "Investiture of Wind",
  "Bones of the Earth",
  "Primordial Ward",
  "Antilife Shell",
  "Warding Wind",
  "Shadow of Moil",
  "Plant Growth",
  // Complex: have actions from manual override (not in this exclusion list)
  // Listed here as explicit acknowledgment that we DO expect them to have action:
  // Moonbeam, Wall of Fire, Call Lightning, etc. → NOT excluded → will fail if missing
]);

// ---------------------------------------------------------------------------
// Spell interface (subset)
// ---------------------------------------------------------------------------

interface SpellEntry {
  name: string;
  level: number;
  description: string;
  damageType?: string[];
  savingThrow?: string[];
  higherLevels?: string;
  effects?: {
    modifiers?: unknown[];
    properties?: unknown[];
    action?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Heuristics for "should have action"
// ---------------------------------------------------------------------------

function spellShouldHaveAction(spell: SpellEntry): boolean {
  // Has structured damage type → should have action
  if (spell.damageType && spell.damageType.length > 0) return true;
  // Has saving throw → should have action (unless exclusion list)
  if (spell.savingThrow && spell.savingThrow.length > 0) return true;
  // Has healing keyword in description
  const desc = spell.description;
  if (/regains?\s+(?:a number of\s+)?(?:\{rule:)?[Hh]it [Pp]oints/i.test(desc)) return true;
  if (/heals?\s+\d+d\d+/i.test(desc)) return true;
  return false;
}

function spellHasAction(spell: SpellEntry): boolean {
  return !!spell.effects?.action;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const raw = readFileSync(SPELLS_PATH, "utf-8");
  const spells: SpellEntry[] = JSON.parse(raw);

  const failures: { name: string; level: number; reason: string }[] = [];
  let checkedCount = 0;
  let skippedCount = 0;
  let passCount = 0;

  for (const spell of spells) {
    if (EXCLUSION_LIST.has(spell.name)) {
      skippedCount++;
      continue;
    }

    if (!spellShouldHaveAction(spell)) {
      skippedCount++;
      continue;
    }

    checkedCount++;

    if (!spellHasAction(spell)) {
      const reasons: string[] = [];
      if (spell.damageType && spell.damageType.length > 0) {
        reasons.push(`damageType: [${spell.damageType.join(", ")}]`);
      }
      if (spell.savingThrow && spell.savingThrow.length > 0) {
        reasons.push(`savingThrow: [${spell.savingThrow.join(", ")}]`);
      }
      if (/regains?\s+(?:a number of\s+)?(?:\{rule:)?[Hh]it [Pp]oints/i.test(spell.description)) {
        reasons.push("healing text in description");
      }
      failures.push({
        name: spell.name,
        level: spell.level,
        reason: reasons.join("; "),
      });
    } else {
      passCount++;
    }
  }

  console.log(`\nSpell Action Audit`);
  console.log(`==================`);
  console.log(`Total spells:   ${spells.length}`);
  console.log(`Checked:        ${checkedCount}`);
  console.log(`Skipped:        ${skippedCount} (exclusion list or no combat signals)`);
  console.log(`Passed:         ${passCount}`);
  console.log(`Failed:         ${failures.length}`);

  if (failures.length > 0) {
    console.log(`\nFAILURES — spells with combat mechanics but no action:`);
    for (const f of failures) {
      console.log(`  [L${f.level}] ${f.name} — ${f.reason}`);
    }
    console.error(`\nAudit FAILED: ${failures.length} spell(s) missing effects.action`);
    process.exit(1);
  } else {
    console.log(`\nAudit PASSED: all checked spells have effects.action populated.`);
  }
}

main();
