import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WSClient } from "../ws-client.js";
import {
  getSpell,
  getMonster,
  getCondition,
  getMagicItem,
  getFeat,
  getClass,
  getSpecies,
  getBackground,
  getOptionalFeature,
  getAction,
  getLanguage,
  getDisease,
  searchSpells,
  searchMonsters,
  searchMagicItems,
  searchFeats,
  searchOptionalFeatures,
  classesArray,
  speciesArray,
  backgroundsArray,
  conditionsArray,
  actionsArray,
  getClassResources,
  type SpellData,
  type MonsterData,
  type ConditionData,
  type MagicItemData,
  type FeatData,
  type ClassAssembled,
  type SpeciesData,
  type BackgroundData,
  type OptionalFeatureData,
  type ActionData,
  type LanguageData,
  type DiseaseData,
} from "@unseen-servant/shared/data";
import {
  formatSchool,
  formatCastingTime,
  formatRange,
  formatComponents,
  formatDuration,
  isConcentration,
  isRitual,
  formatSpellLevel,
  formatMonsterSize,
  formatMonsterType,
  formatMonsterAc,
  formatMonsterHp,
  formatMonsterSpeed,
  formatMonsterCr,
  crToXp,
  formatAbilityMod,
  formatSaves,
  formatSkills,
  flattenResistances,
  flattenConditionImmunities,
  getHitDice,
  getSavingThrows,
  getArmorProfs,
  getWeaponProfs,
  getToolProfs,
  getSkillChoices,
  getCasterType,
  formatFeatCategory,
  formatPrerequisite,
  formatSpeciesSize,
  getSpeciesSpeed,
  getBackgroundSkills,
  getBackgroundTools,
  getBackgroundFeat,
  getBackgroundAbilityScores,
  formatOptionalFeatureType,
  entriesToText,
  stripTags,
  ABILITY_MAP,
} from "@unseen-servant/shared";

// ─── Formatting Helpers ─────────────────────────────────────

function formatSpell(s: SpellData): string {
  let text = `# ${s.name}\n*${formatSpellLevel(s)} ${formatSchool(s.school)}*`;
  if (isRitual(s)) text += " (ritual)";
  if (isConcentration(s)) text += " (concentration)";
  text += "\n\n";
  text += `**Casting Time:** ${formatCastingTime(s)}\n`;
  text += `**Range:** ${formatRange(s.range)}\n`;
  text += `**Components:** ${formatComponents(s)}\n`;
  text += `**Duration:** ${formatDuration(s)}\n`;
  if (s.classes?.fromClassList?.length) {
    text += `**Classes:** ${s.classes.fromClassList.map((c) => c.name).join(", ")}\n`;
  }
  if (s.damageInflict?.length) text += `**Damage Type:** ${s.damageInflict.join(", ")}\n`;
  text += `\n${entriesToText(s.entries)}`;
  if (s.entriesHigherLevel?.length)
    text += `\n\n**At Higher Levels.** ${entriesToText(s.entriesHigherLevel)}`;
  text += `\n\n*Source: ${s.source}*`;
  return text;
}

function formatMonster(m: MonsterData): string {
  let text = `# ${m.name}\n*${formatMonsterSize(m.size)} ${formatMonsterType(m.type)}`;
  if (m.alignment?.length) text += `, ${m.alignment.join(" ")}`;
  text += "*\n\n";
  text += `**AC:** ${formatMonsterAc(m.ac)} | **HP:** ${formatMonsterHp(m.hp)} | **Speed:** ${formatMonsterSpeed(m.speed)}\n`;

  // Ability scores
  text += `**STR** ${m.str} (${formatAbilityMod(m.str)}) **DEX** ${m.dex} (${formatAbilityMod(m.dex)}) **CON** ${m.con} (${formatAbilityMod(m.con)}) **INT** ${m.int} (${formatAbilityMod(m.int)}) **WIS** ${m.wis} (${formatAbilityMod(m.wis)}) **CHA** ${m.cha} (${formatAbilityMod(m.cha)})\n`;

  if (m.save && Object.keys(m.save).length > 0) {
    text += `**Saving Throws:** ${formatSaves(m.save)}\n`;
  }
  if (m.skill && Object.keys(m.skill).length > 0) {
    text += `**Skills:** ${formatSkills(m.skill)}\n`;
  }
  if (m.vulnerable?.length) text += `**Vulnerabilities:** ${flattenResistances(m.vulnerable)}\n`;
  if (m.resist?.length) text += `**Resistances:** ${flattenResistances(m.resist)}\n`;
  if (m.immune?.length) text += `**Immunities:** ${flattenResistances(m.immune)}\n`;
  if (m.conditionImmune?.length)
    text += `**Condition Immunities:** ${flattenConditionImmunities(m.conditionImmune)}\n`;
  if (m.senses?.length) text += `**Senses:** ${m.senses.join(", ")}\n`;
  text += `**Passive Perception:** ${m.passive}\n`;
  if (m.languages?.length) text += `**Languages:** ${m.languages.join(", ")}\n`;
  const crStr = formatMonsterCr(m.cr);
  text += `**CR:** ${crStr} (${crToXp(m.cr).toLocaleString()} XP)\n`;

  if (m.spellcasting?.length) {
    for (const sc of m.spellcasting) {
      text += `\n**${sc.name}:**\n`;
      if (sc.headerEntries) text += entriesToText(sc.headerEntries) + "\n";
      if (sc.will?.length) text += `At will: ${sc.will.map(stripTags).join(", ")}\n`;
      if (sc.daily) {
        for (const [k, v] of Object.entries(sc.daily)) {
          const perDay = k.replace("e", "");
          text += `${perDay}/day each: ${v.map(stripTags).join(", ")}\n`;
        }
      }
    }
  }

  if (m.trait?.length) {
    text += "\n**Traits:**\n";
    for (const t of m.trait) text += `- **${t.name}.** ${entriesToText(t.entries)}\n`;
  }
  if (m.action?.length) {
    text += "\n**Actions:**\n";
    for (const a of m.action) text += `- **${a.name}.** ${entriesToText(a.entries)}\n`;
  }
  if (m.bonus?.length) {
    text += "\n**Bonus Actions:**\n";
    for (const a of m.bonus) text += `- **${a.name}.** ${entriesToText(a.entries)}\n`;
  }
  if (m.reaction?.length) {
    text += "\n**Reactions:**\n";
    for (const r of m.reaction) text += `- **${r.name}.** ${entriesToText(r.entries)}\n`;
  }
  if (m.legendary?.length) {
    text += "\n**Legendary Actions:**\n";
    if (m.legendaryHeader) text += entriesToText(m.legendaryHeader) + "\n";
    for (const l of m.legendary) text += `- **${l.name}.** ${entriesToText(l.entries)}\n`;
  }
  if (m.lair?.length) {
    text += "\n**Lair Actions:**\n";
    for (const l of m.lair) text += `- **${l.name}.** ${entriesToText(l.entries)}\n`;
  }
  text += `\n*Source: ${m.source}*`;
  return text;
}

function formatCondition(c: ConditionData): string {
  let text = `# ${c.name}\n\n${entriesToText(c.entries)}`;
  text += `\n\n*Source: ${c.source}*`;
  return text;
}

function formatMagicItemFn(item: MagicItemData): string {
  let text = `# ${item.name}\n*${item.type ?? "Wondrous Item"}, ${item.rarity}`;
  if (item.reqAttune) {
    if (typeof item.reqAttune === "string") {
      text += ` (requires attunement ${item.reqAttune})`;
    } else {
      text += " (requires attunement)";
    }
  }
  text += "*\n\n";
  if (item.bonusAc) text += `**AC Bonus:** ${item.bonusAc}\n`;
  if (item.bonusWeapon) text += `**Weapon Bonus:** ${item.bonusWeapon}\n`;
  if (item.bonusSpellAttack) text += `**Spell Attack Bonus:** ${item.bonusSpellAttack}\n`;
  if (item.bonusSpellSaveDc) text += `**Spell Save DC Bonus:** ${item.bonusSpellSaveDc}\n`;
  text += entriesToText(item.entries);
  text += `\n\n*Source: ${item.source}*`;
  return text;
}

function formatFeatFn(f: FeatData): string {
  let text = `# ${f.name}\n*${formatFeatCategory(f.category)} feat*`;
  if (f.prerequisite?.length) text += ` *(Prerequisite: ${formatPrerequisite(f.prerequisite)})*`;
  if (f.repeatable) text += " *(Repeatable)*";
  text += "\n\n";
  text += entriesToText(f.entries);
  if (f.ability?.length) {
    const abilityDesc = f.ability
      .map((a) => {
        if (a.choose) {
          return `Choose ${a.choose.count ?? 1} from ${a.choose.from.map((k) => ABILITY_MAP[k] ?? k).join(", ")} (+${a.choose.amount ?? 1})`;
        }
        return Object.entries(a)
          .filter(([k]) => k !== "choose")
          .map(([k, v]) => `${ABILITY_MAP[k] ?? k} +${v}`)
          .join(", ");
      })
      .join("; ");
    text += `\n\n**Ability Score Increase:** ${abilityDesc}`;
  }
  if (f.resist?.length) text += `\n\n**Resistances:** ${f.resist.join(", ")}`;
  if (f.senses && Object.keys(f.senses).length > 0) {
    text += `\n\n**Senses:** ${Object.entries(f.senses)
      .map(([k, v]) => `${k} ${v} ft.`)
      .join(", ")}`;
  }
  text += `\n\n*Source: ${f.source}*`;
  return text;
}

function formatClassFn(c: ClassAssembled): string {
  let text = `# ${c.name}\n\n`;
  text += `**Hit Die:** ${getHitDice(c)}\n`;
  const primaryAbs = c.primaryAbility.flatMap((a) =>
    Object.keys(a)
      .filter((k) => a[k])
      .map((k) => ABILITY_MAP[k] ?? k),
  );
  text += `**Primary Ability:** ${primaryAbs.join(", ")}\n`;
  text += `**Saving Throws:** ${getSavingThrows(c).join(", ")}\n`;
  const armorProfs = getArmorProfs(c);
  if (armorProfs.length) text += `**Armor Proficiencies:** ${armorProfs.join(", ")}\n`;
  const weaponProfs = getWeaponProfs(c);
  if (weaponProfs.length) text += `**Weapon Proficiencies:** ${weaponProfs.join(", ")}\n`;
  const toolProfs = getToolProfs(c);
  if (toolProfs.length) text += `**Tool Proficiencies:** ${toolProfs.join(", ")}\n`;
  const skills = getSkillChoices(c);
  if (skills) text += `**Skill Choices:** Choose ${skills.count} from ${skills.from.join(", ")}\n`;
  const casterType = getCasterType(c);
  if (casterType) text += `**Caster Type:** ${casterType}\n`;

  const resources = getClassResources(c.name);
  if (resources.length > 0) {
    text += "\n**Class Resources:**\n";
    for (const r of resources) {
      const uses =
        typeof r.uses === "number"
          ? `${r.uses}`
          : `${r.uses.abilityMod} modifier (min ${r.uses.minimum ?? 1})`;
      text += `- **${r.name}** (level ${r.levelAvailable}+): ${uses} uses, resets on ${r.resetType} rest\n`;
    }
  }

  if (c.resolvedFeatures.length > 0) {
    text += "\n**Features:**\n";
    for (const f of c.resolvedFeatures) {
      const desc = entriesToText(f.entries);
      text += `- **${f.name}** (level ${f.level}): ${desc.slice(0, 200)}${desc.length > 200 ? "..." : ""}\n`;
    }
  }

  if (c.resolvedSubclasses.length > 0) {
    text += `\n**Subclasses:** ${c.resolvedSubclasses.map((s) => s.name).join(", ")}\n`;
  }

  text += `\n*Source: ${c.source}*`;
  return text;
}

function formatSpeciesFn(s: SpeciesData): string {
  let text = `# ${s.name}\n\n`;
  text += `**Size:** ${formatSpeciesSize(s.size)}\n`;
  text += `**Speed:** ${getSpeciesSpeed(s)} ft.\n`;
  if (s.darkvision) text += `**Darkvision:** ${s.darkvision} ft.\n`;
  if (s.resist?.length) text += `**Resistances:** ${s.resist.join(", ")}\n`;

  if (s.entries.length > 0) {
    text += "\n**Traits:**\n";
    text += entriesToText(s.entries);
  }

  text += `\n\n*Source: ${s.source}*`;
  return text;
}

function formatBackgroundFn(b: BackgroundData): string {
  let text = `# ${b.name}\n\n`;
  if (b.entries) text += entriesToText(b.entries) + "\n\n";
  const skills = getBackgroundSkills(b);
  if (skills.length) text += `**Skill Proficiencies:** ${skills.join(", ")}\n`;
  const tools = getBackgroundTools(b);
  if (tools.length) text += `**Tool Proficiencies:** ${tools.join(", ")}\n`;
  const feat = getBackgroundFeat(b);
  if (feat) text += `**Feat:** ${feat}\n`;
  const asi = getBackgroundAbilityScores(b);
  if (asi)
    text += `**Ability Scores:** Choose from ${asi.from.map((k) => ABILITY_MAP[k] ?? k).join(", ")} (weights: ${asi.weights.join(", ")})\n`;
  text += `\n*Source: ${b.source}*`;
  return text;
}

function formatOptionalFeatureFn(f: OptionalFeatureData): string {
  let text = `# ${f.name}\n*${formatOptionalFeatureType(f.featureType)}*`;
  if (f.prerequisite?.length) text += ` *(Prerequisite: ${formatPrerequisite(f.prerequisite)})*`;
  text += "\n\n";
  text += entriesToText(f.entries);
  text += `\n\n*Source: ${f.source}*`;
  return text;
}

function formatActionFn(a: ActionData): string {
  let text = `# ${a.name}\n`;
  if (a.time?.length) {
    text += `*${a.time.map((t) => `${t.number} ${t.unit}`).join(", ")}*\n`;
  }
  text += "\n" + entriesToText(a.entries);
  text += `\n\n*Source: ${a.source}*`;
  return text;
}

function formatLanguageFn(l: LanguageData): string {
  let text = `# ${l.name}\n*${l.type} language*\n\n`;
  if (l.typicalSpeakers?.length) text += `**Typical Speakers:** ${l.typicalSpeakers.join(", ")}\n`;
  if (l.script) text += `**Script:** ${l.script}\n`;
  if (l.entries) text += "\n" + entriesToText(l.entries);
  text += `\n\n*Source: ${l.source}*`;
  return text;
}

function formatDiseaseFn(d: DiseaseData): string {
  let text = `# ${d.name}\n\n`;
  text += entriesToText(d.entries);
  text += `\n\n*Source: ${d.source}*`;
  return text;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Send a visible "[Rules]" system event to the activity log when lookup fails. */
function logLookupFailure(wsClient: WSClient, category: string, name: string): void {
  wsClient.broadcastSystemEvent(
    `[Rules] "${name}" not found in any source — DM is using training knowledge`,
  );
  console.error(`[srd-tools] ${category} lookup failed: "${name}"`);
}

function notFoundResult(category: string, name: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `"${name}" not found in the D&D 2024 database. Use your training knowledge as fallback.`,
      },
    ],
  };
}

// ─── Tool Registration ──────────────────────────────────────

export function registerSrdTools(server: McpServer, wsClient: WSClient): void {
  server.tool(
    "lookup_spell",
    "Look up a spell from the D&D 2024 database. Call this BEFORE resolving any spell cast.",
    {
      spell_name: z
        .string()
        .describe("Spell name, e.g. 'Fireball', 'Cure Wounds', 'Shield', 'Silvery Barbs'"),
    },
    async ({ spell_name }) => {
      const spell = getSpell(spell_name);
      if (spell) {
        return { content: [{ type: "text" as const, text: formatSpell(spell) }] };
      }

      logLookupFailure(wsClient, "Spell", spell_name);
      return notFoundResult("Spell", spell_name);
    },
  );

  server.tool(
    "lookup_monster",
    "Look up a monster/creature stat block from the D&D 2024 database. Call this for every enemy type BEFORE combat.",
    {
      monster_name: z
        .string()
        .describe("Monster name, e.g. 'Goblin', 'Adult Red Dragon', 'Bugbear'"),
    },
    async ({ monster_name }) => {
      const monster = getMonster(monster_name);
      if (monster) {
        return { content: [{ type: "text" as const, text: formatMonster(monster) }] };
      }

      logLookupFailure(wsClient, "Monster", monster_name);
      return notFoundResult("Monster", monster_name);
    },
  );

  server.tool(
    "lookup_condition",
    "Look up the exact mechanical effects of a D&D condition from the D&D 2024 database. Call this BEFORE applying any condition.",
    {
      condition_name: z
        .string()
        .describe("Condition name, e.g. 'Grappled', 'Stunned', 'Prone', 'Frightened'"),
    },
    async ({ condition_name }) => {
      const condition = getCondition(condition_name);
      if (condition) {
        return { content: [{ type: "text" as const, text: formatCondition(condition) }] };
      }

      logLookupFailure(wsClient, "Condition", condition_name);
      return notFoundResult("Condition", condition_name);
    },
  );

  server.tool(
    "lookup_magic_item",
    "Look up a magic item from the D&D 2024 database. Returns rarity, attunement, and full description.",
    {
      item_name: z.string().describe("Magic item name, e.g. 'Bag of Holding', 'Flame Tongue'"),
    },
    async ({ item_name }) => {
      const item = getMagicItem(item_name);
      if (item) {
        return { content: [{ type: "text" as const, text: formatMagicItemFn(item) }] };
      }

      logLookupFailure(wsClient, "Magic Item", item_name);
      return notFoundResult("Magic Item", item_name);
    },
  );

  server.tool(
    "lookup_feat",
    "Look up a feat from the D&D 2024 database. Returns prerequisites, description, and mechanical effects.",
    {
      feat_name: z.string().describe("Feat name, e.g. 'Alert', 'Great Weapon Master'"),
    },
    async ({ feat_name }) => {
      const feat = getFeat(feat_name);
      if (feat) {
        return { content: [{ type: "text" as const, text: formatFeatFn(feat) }] };
      }

      logLookupFailure(wsClient, "Feat", feat_name);
      return notFoundResult("Feat", feat_name);
    },
  );

  server.tool(
    "lookup_class",
    "Look up a D&D class from the D&D 2024 database. Returns hit die, spellcasting, features, subclasses, and resources.",
    {
      class_name: z.string().describe("Class name, e.g. 'Paladin', 'Rogue', 'Wizard'"),
    },
    async ({ class_name }) => {
      const cls = getClass(class_name);
      if (cls) {
        return { content: [{ type: "text" as const, text: formatClassFn(cls) }] };
      }

      logLookupFailure(wsClient, "Class", class_name);
      return notFoundResult("Class", class_name);
    },
  );

  server.tool(
    "lookup_species",
    "Look up a D&D species/race from the D&D 2024 database. Returns size, speed, traits, and abilities.",
    {
      species_name: z
        .string()
        .describe("Species name, e.g. 'Tiefling', 'Aasimar', 'Goliath', 'Kenku'"),
    },
    async ({ species_name }) => {
      const sp = getSpecies(species_name);
      if (sp) {
        return { content: [{ type: "text" as const, text: formatSpeciesFn(sp) }] };
      }

      logLookupFailure(wsClient, "Species", species_name);
      return notFoundResult("Species", species_name);
    },
  );

  server.tool(
    "lookup_background",
    "Look up a D&D background from the D&D 2024 database. Returns skill proficiencies, feat, ability scores, and equipment.",
    {
      background_name: z
        .string()
        .describe("Background name, e.g. 'Noble', 'Criminal', 'Sage', 'Haunted One'"),
    },
    async ({ background_name }) => {
      const bg = getBackground(background_name);
      if (bg) {
        return { content: [{ type: "text" as const, text: formatBackgroundFn(bg) }] };
      }

      logLookupFailure(wsClient, "Background", background_name);
      return notFoundResult("Background", background_name);
    },
  );

  // ─── New Lookup Tools ────────────────────────────────────

  server.tool(
    "lookup_optional_feature",
    "Look up an optional class feature (Eldritch Invocation, Battle Master Maneuver, Metamagic, etc.) from the D&D 2024 database.",
    {
      feature_name: z
        .string()
        .describe("Feature name, e.g. 'Agonizing Blast', 'Riposte', 'Quickened Spell'"),
    },
    async ({ feature_name }) => {
      const feature = getOptionalFeature(feature_name);
      if (feature) {
        return { content: [{ type: "text" as const, text: formatOptionalFeatureFn(feature) }] };
      }

      logLookupFailure(wsClient, "Optional Feature", feature_name);
      return notFoundResult("Optional Feature", feature_name);
    },
  );

  server.tool(
    "lookup_action",
    "Look up a game action (Attack, Dash, Dodge, Disengage, Help, Hide, etc.) from the D&D 2024 database.",
    {
      action_name: z.string().describe("Action name, e.g. 'Attack', 'Grapple', 'Shove', 'Dodge'"),
    },
    async ({ action_name }) => {
      const action = getAction(action_name);
      if (action) {
        return { content: [{ type: "text" as const, text: formatActionFn(action) }] };
      }

      logLookupFailure(wsClient, "Action", action_name);
      return notFoundResult("Action", action_name);
    },
  );

  server.tool(
    "lookup_language",
    "Look up a D&D language from the 2024 database.",
    {
      language_name: z.string().describe("Language name, e.g. 'Elvish', 'Draconic', 'Infernal'"),
    },
    async ({ language_name }) => {
      const lang = getLanguage(language_name);
      if (lang) {
        return { content: [{ type: "text" as const, text: formatLanguageFn(lang) }] };
      }

      logLookupFailure(wsClient, "Language", language_name);
      return notFoundResult("Language", language_name);
    },
  );

  server.tool(
    "lookup_disease",
    "Look up a disease from the D&D 2024 database.",
    {
      disease_name: z.string().describe("Disease name, e.g. 'Cackle Fever', 'Sewer Plague'"),
    },
    async ({ disease_name }) => {
      const disease = getDisease(disease_name);
      if (disease) {
        return { content: [{ type: "text" as const, text: formatDiseaseFn(disease) }] };
      }

      logLookupFailure(wsClient, "Disease", disease_name);
      return notFoundResult("Disease", disease_name);
    },
  );

  // ─── Search ──────────────────────────────────────────────

  server.tool(
    "search_rules",
    "Search the D&D 2024 database for rules, spells, monsters, items, feats, conditions, classes, species, backgrounds, optional features, and actions matching a query.",
    {
      query: z
        .string()
        .describe(
          "Search query, e.g. 'opportunity attack', 'fire damage spell', 'flying creature'",
        ),
      limit: z.number().optional().default(5).describe("Max results to return (default 5)"),
    },
    async ({ query, limit }) => {
      const results: string[] = [];
      const lowerQuery = query.toLowerCase();

      // Search across all data types
      const matchedSpells = searchSpells(query).slice(0, limit);
      const matchedMonsters = searchMonsters(query).slice(0, limit);
      const matchedItems = searchMagicItems(query).slice(0, limit);
      const matchedFeats = searchFeats(query).slice(0, limit);
      const matchedOptFeats = searchOptionalFeatures(query).slice(0, limit);

      const matchedConditions = conditionsArray
        .filter(
          (c) =>
            c.name.toLowerCase().includes(lowerQuery) ||
            entriesToText(c.entries).toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit);

      const matchedClasses = classesArray
        .filter((c) => c.name.toLowerCase().includes(lowerQuery))
        .slice(0, limit);

      const matchedSpecies = speciesArray
        .filter(
          (s) =>
            s.name.toLowerCase().includes(lowerQuery) ||
            entriesToText(s.entries).toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit);

      const matchedBackgrounds = backgroundsArray
        .filter(
          (b) =>
            b.name.toLowerCase().includes(lowerQuery) ||
            (b.entries && entriesToText(b.entries).toLowerCase().includes(lowerQuery)),
        )
        .slice(0, limit);

      const matchedActions = actionsArray
        .filter(
          (a) =>
            a.name.toLowerCase().includes(lowerQuery) ||
            entriesToText(a.entries).toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit);

      if (matchedConditions.length > 0) {
        results.push(
          "## Conditions\n" + matchedConditions.map((c) => formatCondition(c)).join("\n\n---\n\n"),
        );
      }
      if (matchedActions.length > 0) {
        results.push(
          "## Actions\n" + matchedActions.map((a) => formatActionFn(a)).join("\n\n---\n\n"),
        );
      }
      if (matchedClasses.length > 0) {
        results.push(
          "## Classes\n" +
            matchedClasses
              .map((c) => `- **${c.name}** (${getHitDice(c)}, ${getCasterType(c) ?? "non-caster"})`)
              .join("\n"),
        );
      }
      if (matchedSpells.length > 0) {
        results.push(
          "## Spells\n" +
            matchedSpells
              .map(
                (s) =>
                  `- **${s.name}** (${formatSpellLevel(s)} ${formatSchool(s.school)}): ${entriesToText(s.entries).slice(0, 150)}...`,
              )
              .join("\n"),
        );
      }
      if (matchedMonsters.length > 0) {
        results.push(
          "## Monsters\n" +
            matchedMonsters
              .map(
                (m) =>
                  `- **${m.name}** (CR ${formatMonsterCr(m.cr)}, ${formatMonsterSize(m.size)} ${formatMonsterType(m.type)})`,
              )
              .join("\n"),
        );
      }
      if (matchedItems.length > 0) {
        results.push(
          "## Magic Items\n" +
            matchedItems
              .map((i) => `- **${i.name}** (${i.rarity}, ${i.type ?? "wondrous"})`)
              .join("\n"),
        );
      }
      if (matchedFeats.length > 0) {
        results.push(
          "## Feats\n" +
            matchedFeats
              .map(
                (f) =>
                  `- **${f.name}** (${formatFeatCategory(f.category)}): ${entriesToText(f.entries).slice(0, 150)}...`,
              )
              .join("\n"),
        );
      }
      if (matchedOptFeats.length > 0) {
        results.push(
          "## Optional Features\n" +
            matchedOptFeats
              .map(
                (f) =>
                  `- **${f.name}** (${formatOptionalFeatureType(f.featureType)}): ${entriesToText(f.entries).slice(0, 150)}...`,
              )
              .join("\n"),
        );
      }
      if (matchedSpecies.length > 0) {
        results.push(
          "## Species\n" +
            matchedSpecies
              .map(
                (s) =>
                  `- **${s.name}** (${formatSpeciesSize(s.size)}, speed ${getSpeciesSpeed(s)} ft.)`,
              )
              .join("\n"),
        );
      }
      if (matchedBackgrounds.length > 0) {
        results.push(
          "## Backgrounds\n" +
            matchedBackgrounds
              .map(
                (b) =>
                  `- **${b.name}**: ${b.entries ? entriesToText(b.entries).slice(0, 150) + "..." : ""}`,
              )
              .join("\n"),
        );
      }

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No results found matching "${query}" in the D&D 2024 database. Use your training knowledge as fallback.`,
            },
          ],
        };
      }

      return { content: [{ type: "text" as const, text: results.join("\n\n") }] };
    },
  );
}
