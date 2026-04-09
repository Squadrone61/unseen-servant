import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { log } from "../logger.js";
import type { WSClient } from "../ws-client.js";
import type { GameLogger } from "../services/game-logger.js";
import {
  searchSpells,
  searchMonsters,
  searchMagicItems,
  searchFeats,
  searchOptionalFeatures,
  fuzzyLookup,
  spells,
  spellsArray,
  monsters,
  monstersArray,
  conditions,
  conditionsArray,
  magicItems,
  magicItemsArray,
  feats,
  featsArray,
  classes,
  classesArray,
  species,
  speciesArray,
  backgrounds,
  backgroundsArray,
  optionalFeatures,
  optionalFeaturesArray,
  actions,
  actionsArray,
  languages,
  languagesArray,
  diseases,
  diseasesArray,
  type SpellDb,
  type MonsterDb,
  type ConditionDb,
  type MagicItemDb,
  type FeatDb,
  type ClassDb,
  type SpeciesDb,
  type BackgroundDb,
  type OptionalFeatureDb,
  type ActionDb,
  type LanguageDb,
  type DiseaseDb,
} from "@unseen-servant/shared/data";
import {
  formatSchool,
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
  formatFeatCategory,
  formatSpeciesSize,
  formatOptionalFeatureType,
  entriesToText,
  stripTags,
  ABILITY_MAP,
} from "@unseen-servant/shared";

// ─── Formatting Helpers ─────────────────────────────────────

function formatSpellSummary(s: SpellDb): string {
  const levelStr = s.level === 0 ? "Cantrip" : `Level ${s.level}`;
  const parts: string[] = [
    `${s.name} (${s.school}, ${levelStr}) — ${s.castingTime}, ${s.range}, ${s.duration}`,
  ];
  if (s.concentration) parts.push("Concentration");
  if (s.ritual) parts.push("Ritual");
  if (s.damageType?.length) parts.push(s.damageType.join("/"));
  if (s.savingThrow?.length)
    parts.push(`${s.savingThrow.map((st) => st.toUpperCase()).join("/")} save`);
  parts.push(`Components: ${s.components}`);
  return parts.join(" | ");
}

function formatSpell(s: SpellDb): string {
  const levelStr = s.level === 0 ? "Cantrip" : `Level ${s.level}`;
  let text = `# ${s.name}\n*${levelStr} ${s.school}*`;
  if (s.ritual) text += " (ritual)";
  if (s.concentration) text += " (concentration)";
  text += "\n\n";
  text += `**Casting Time:** ${s.castingTime}\n`;
  text += `**Range:** ${s.range}\n`;
  text += `**Components:** ${s.components}\n`;
  text += `**Duration:** ${s.duration}\n`;
  if (s.classes?.length) text += `**Classes:** ${s.classes.join(", ")}\n`;
  if (s.damageType?.length) text += `**Damage Type:** ${s.damageType.join(", ")}\n`;
  text += `\n${s.description}`;
  if (s.higherLevels) text += `\n\n**At Higher Levels:** ${s.higherLevels}`;
  return text;
}

function formatMonsterSummary(m: MonsterDb): string {
  const crStr = formatMonsterCr(m.cr);
  const xp = crToXp(m.cr).toLocaleString();
  const parts: string[] = [
    `${m.name}: CR ${crStr} (${xp} XP)`,
    `${formatMonsterSize(m.size)} ${formatMonsterType(m.type)}`,
    `AC ${formatMonsterAc(m.ac)}`,
    `HP ${formatMonsterHp(m.hp)}`,
  ];
  // First 1-2 actions: name + to-hit + damage
  if (m.action?.length) {
    const actionSummaries = m.action.slice(0, 2).map((a) => {
      const text = entriesToText(a.entries);
      const hitMatch = text.match(/\{@hit (\+?\d+)\}/i) ?? text.match(/(\+\d+) to hit/i);
      const dmgMatch =
        text.match(/(\d+d\d+(?:\s*\+\s*\d+)?)\s+(\w+)\s+damage/i) ??
        text.match(/\((\d+d\d+(?:\s*\+\s*\d+)?)\)/);
      let summary = a.name;
      if (hitMatch) summary += ` ${hitMatch[1]}`;
      if (dmgMatch) summary += ` ${dmgMatch[1]}${dmgMatch[2] ? " " + dmgMatch[2] : ""}`;
      return summary;
    });
    parts.push(actionSummaries.join(", "));
  }
  parts.push(`STR ${m.str} DEX ${m.dex} CON ${m.con} INT ${m.int} WIS ${m.wis} CHA ${m.cha}`);
  return parts.join(" | ");
}

function formatMonster(m: MonsterDb): string {
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
  return text;
}

function formatConditionSummary(c: ConditionDb): string {
  const fullText = c.description;
  // Take the first ~120 chars, cut at sentence boundary if possible
  let summary = fullText.slice(0, 150);
  const sentenceEnd = summary.lastIndexOf(". ");
  if (sentenceEnd > 40) summary = summary.slice(0, sentenceEnd + 1);
  else if (summary.length >= 150) summary += "...";
  return `${c.name}: ${summary}`;
}

function formatCondition(c: ConditionDb): string {
  return `# ${c.name}\n\n${c.description}`;
}

function formatMagicItemSummary(item: MagicItemDb): string {
  const parts: string[] = [`${item.name}: ${item.type ?? "Wondrous item"}, ${item.rarity}`];
  if (item.attunement) {
    parts.push(
      typeof item.attunement === "string" ? `attunement ${item.attunement}` : "attunement",
    );
  }
  if (item.charges) parts.push(`${item.charges} charges`);
  // Brief description
  const brief = item.description.slice(0, 100);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (item.description.length > 100 ? "..." : ""));
  return parts.join(" | ");
}

function formatMagicItemFn(item: MagicItemDb): string {
  let text = `# ${item.name}\n*${item.type ?? "Wondrous Item"}, ${item.rarity}`;
  if (item.attunement) {
    if (typeof item.attunement === "string") {
      text += ` (requires attunement ${item.attunement})`;
    } else {
      text += " (requires attunement)";
    }
  }
  text += "*\n\n";
  if (item.charges) text += `**Charges:** ${item.charges}\n`;
  if (item.recharge) text += `**Recharge:** ${item.recharge}\n`;
  text += item.description;
  return text;
}

function formatFeatSummary(f: FeatDb): string {
  const parts: string[] = [`${f.name}: ${formatFeatCategory(f.category)} feat`];
  if (f.prerequisite) parts.push(`Prereq: ${f.prerequisite}`);
  // Brief mechanical description
  const brief = f.description.slice(0, 120);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (f.description.length > 120 ? "..." : ""));
  return parts.join(" | ");
}

function formatFeatFn(f: FeatDb): string {
  let text = `# ${f.name}\n*${formatFeatCategory(f.category)} feat*`;
  if (f.prerequisite) text += ` *(Prerequisite: ${f.prerequisite})*`;
  if (f.repeatable) text += " *(Repeatable)*";
  text += "\n\n";
  text += f.description;
  return text;
}

function formatClassSummary(c: ClassDb): string {
  const parts: string[] = [
    `${c.name}: d${c.hitDiceFaces} HD`,
    `Saves: ${c.savingThrows.join("/")}`,
  ];
  if (c.armorProficiencies.length) parts.push(c.armorProficiencies.join(", "));
  if (c.casterProgression) parts.push(`${c.casterProgression} caster`);
  else parts.push("non-caster");
  parts.push(`${c.subclasses.length} subclasses`);
  return parts.join(" | ");
}

function formatClassFn(c: ClassDb): string {
  let text = `# ${c.name}\n\n`;
  text += `**Hit Die:** d${c.hitDiceFaces}\n`;
  text += `**Saving Throws:** ${c.savingThrows.join(", ")}\n`;
  if (c.armorProficiencies.length)
    text += `**Armor Proficiencies:** ${c.armorProficiencies.join(", ")}\n`;
  if (c.weaponProficiencies.length)
    text += `**Weapon Proficiencies:** ${c.weaponProficiencies.join(", ")}\n`;
  if (c.toolProficiencies.length)
    text += `**Tool Proficiencies:** ${c.toolProficiencies.join(", ")}\n`;
  if (c.skillChoices.from.length)
    text += `**Skill Choices:** Choose ${c.skillChoices.count} from ${c.skillChoices.from.join(", ")}\n`;
  if (c.casterProgression) text += `**Caster Type:** ${c.casterProgression}\n`;

  if (c.features.length > 0) {
    text += "\n**Features:**\n";
    for (const f of c.features) {
      text += `- **${f.name}** (level ${f.level}): ${f.description.slice(0, 200)}${f.description.length > 200 ? "..." : ""}\n`;
    }
  }

  if (c.subclasses.length > 0) {
    text += `\n**Subclasses:** ${c.subclasses.map((s) => s.name).join(", ")}\n`;
  }

  return text;
}

function formatSpeciesSummary(s: SpeciesDb): string {
  const parts: string[] = [`${s.name}: ${formatSpeciesSize(s.size)}, ${s.speed} ft.`];
  if (s.darkvision) parts.push(`Darkvision ${s.darkvision} ft.`);
  return parts.join(" | ");
}

function formatSpeciesFn(s: SpeciesDb): string {
  let text = `# ${s.name}\n\n`;
  text += `**Size:** ${formatSpeciesSize(s.size)}\n`;
  text += `**Speed:** ${s.speed} ft.\n`;
  if (s.darkvision) text += `**Darkvision:** ${s.darkvision} ft.\n`;
  text += `\n**Description:**\n${s.description}`;
  return text;
}

function formatBackgroundSummary(b: BackgroundDb): string {
  const parts: string[] = [b.name + ":"];
  if (b.skills.length) parts.push(b.skills.join(" + "));
  if (b.tools.length) parts.push(b.tools.join(", "));
  if (b.feat) parts.push(`Feat: ${b.feat}`);
  return parts.join(" | ");
}

function formatBackgroundFn(b: BackgroundDb): string {
  let text = `# ${b.name}\n\n`;
  text += b.description + "\n\n";
  if (b.skills.length) text += `**Skill Proficiencies:** ${b.skills.join(", ")}\n`;
  if (b.tools.length) text += `**Tool Proficiencies:** ${b.tools.join(", ")}\n`;
  if (b.feat) text += `**Feat:** ${b.feat}\n`;
  if (b.abilityScores.from.length) {
    text += `**Ability Scores:** Choose from ${b.abilityScores.from.map((k) => ABILITY_MAP[k] ?? k).join(", ")} (weights: ${b.abilityScores.weights.join(", ")})\n`;
  }
  return text;
}

function formatOptionalFeatureSummary(f: OptionalFeatureDb): string {
  const parts: string[] = [`${f.name}: ${formatOptionalFeatureType(f.featureType)}`];
  if (f.prerequisite) parts.push(`Prereq: ${f.prerequisite}`);
  const brief = f.description.slice(0, 120);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (f.description.length > 120 ? "..." : ""));
  return parts.join(" | ");
}

function formatOptionalFeatureFn(f: OptionalFeatureDb): string {
  let text = `# ${f.name}\n*${formatOptionalFeatureType(f.featureType)}*`;
  if (f.prerequisite) text += ` *(Prerequisite: ${f.prerequisite})*`;
  text += "\n\n";
  text += f.description;
  return text;
}

function formatActionSummary(a: ActionDb): string {
  const parts: string[] = [a.name + ":"];
  if (a.time) parts.push(a.time);
  const brief = a.description.slice(0, 120);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (a.description.length > 120 ? "..." : ""));
  return parts.join(" | ");
}

function formatActionFn(a: ActionDb): string {
  let text = `# ${a.name}\n`;
  if (a.time) text += `*${a.time}*\n`;
  text += "\n" + a.description;
  return text;
}

function formatLanguageSummary(l: LanguageDb): string {
  const parts: string[] = [`${l.name}: ${l.type} language`];
  if (l.typicalSpeakers?.length) parts.push(`Spoken by ${l.typicalSpeakers.join(", ")}`);
  if (l.script) parts.push(`${l.script} script`);
  return parts.join(" | ");
}

function formatLanguageFn(l: LanguageDb): string {
  let text = `# ${l.name}\n*${l.type} language*\n\n`;
  if (l.typicalSpeakers?.length) text += `**Typical Speakers:** ${l.typicalSpeakers.join(", ")}\n`;
  if (l.script) text += `**Script:** ${l.script}\n`;
  if (l.description) text += "\n" + l.description;
  return text;
}

function formatDiseaseSummary(d: DiseaseDb): string {
  const brief = d.description.slice(0, 150);
  const sentenceEnd = brief.lastIndexOf(". ");
  let summary: string;
  if (sentenceEnd > 20) summary = brief.slice(0, sentenceEnd + 1);
  else summary = brief + (d.description.length > 150 ? "..." : "");
  return `${d.name}: ${summary}`;
}

function formatDiseaseFn(d: DiseaseDb): string {
  return `# ${d.name}\n\n${d.description}`;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Send a visible "[Rules]" system event to the activity log when lookup fails. */
function logLookupFailure(wsClient: WSClient, category: string, name: string): void {
  wsClient.broadcastSystemEvent(
    `[Rules] "${name}" not found in any source — DM is using training knowledge`,
  );
  log("srd-tools", `${category} lookup failed: "${name}"`);
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

type ToolResult = { content: { type: "text"; text: string }[] };

function fuzzyLookupOrSuggest<T extends { name: string }>(
  query: string,
  exactMap: Map<string, T>,
  allItems: T[],
  category: string,
  formatSummary: (item: T) => string,
  formatFull: (item: T) => string,
  detail: "summary" | "full",
  wsClient: WSClient,
): ToolResult {
  const result = fuzzyLookup(query, exactMap, allItems);

  if (result.match) {
    const text = detail === "full" ? formatFull(result.match) : formatSummary(result.match);
    const prefix =
      result.matchType !== "exact"
        ? `(Matched "${result.match.name}" from query "${query}")\n\n`
        : "";
    return { content: [{ type: "text", text: prefix + text }] };
  }

  if (result.suggestions.length > 0) {
    const list = result.suggestions.map((s) => `- ${s.name}`).join("\n");
    return {
      content: [
        {
          type: "text",
          text: `"${query}" matched multiple ${category.toLowerCase()}s. Did you mean one of:\n${list}\n\nCall lookup again with the exact name.`,
        },
      ],
    };
  }

  logLookupFailure(wsClient, category, query);
  return notFoundResult(category, query);
}

// ─── Tool Registration ──────────────────────────────────────

export function registerSrdTools(
  server: McpServer,
  wsClient: WSClient,
  gameLogger: GameLogger,
): void {
  /** Wrap an SRD lookup handler to log the tool call. */
  function loggedLookup(
    toolName: string,
    args: Record<string, unknown>,
    result: ToolResult,
  ): ToolResult {
    const text =
      result.content?.[0]?.type === "text"
        ? (result.content[0] as { type: "text"; text: string }).text
        : "";
    gameLogger.toolCall(toolName, args, text);
    return result;
  }

  server.registerTool(
    "lookup_spell",
    {
      description: "Look up a spell from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Spell name, e.g. 'Fireball', 'Cure Wounds', 'Shield', 'Silvery Barbs'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_spell",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          spells,
          spellsArray,
          "Spell",
          formatSpellSummary,
          formatSpell,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_monster",
    {
      description: "Look up a monster/creature stat block from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Monster name, e.g. 'Goblin', 'Adult Red Dragon', 'Bugbear'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_monster",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          monsters,
          monstersArray,
          "Monster",
          formatMonsterSummary,
          formatMonster,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_condition",
    {
      description: "Look up condition effects from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Condition name, e.g. 'Grappled', 'Stunned', 'Prone', 'Frightened'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_condition",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          conditions,
          conditionsArray,
          "Condition",
          formatConditionSummary,
          formatCondition,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_magic_item",
    {
      description: "Look up a magic item from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Magic item name, e.g. 'Bag of Holding', 'Flame Tongue'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_magic_item",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          magicItems,
          magicItemsArray,
          "Magic Item",
          formatMagicItemSummary,
          formatMagicItemFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_feat",
    {
      description: "Look up a feat from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Feat name, e.g. 'Alert', 'Great Weapon Master'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_feat",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          feats,
          featsArray,
          "Feat",
          formatFeatSummary,
          formatFeatFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_class",
    {
      description: "Look up a D&D class from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Class name, e.g. 'Paladin', 'Rogue', 'Wizard'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_class",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          classes,
          classesArray,
          "Class",
          formatClassSummary,
          formatClassFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_species",
    {
      description: "Look up a D&D species/race from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Species name, e.g. 'Tiefling', 'Aasimar', 'Goliath', 'Kenku'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_species",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          species,
          speciesArray,
          "Species",
          formatSpeciesSummary,
          formatSpeciesFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_background",
    {
      description: "Look up a D&D background from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Background name, e.g. 'Noble', 'Criminal', 'Sage', 'Haunted One'. Case-insensitive with fuzzy matching — close matches auto-selected, ambiguous ones return suggestions.",
          ),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_background",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          backgrounds,
          backgroundsArray,
          "Background",
          formatBackgroundSummary,
          formatBackgroundFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  // ─── New Lookup Tools ────────────────────────────────────

  server.registerTool(
    "lookup_optional_feature",
    {
      description:
        "Look up an optional class feature (Eldritch Invocation, Battle Master Maneuver, Metamagic, etc.) from the D&D 2024 database.",
      inputSchema: {
        name: z
          .string()
          .describe("Feature name, e.g. 'Agonizing Blast', 'Riposte', 'Quickened Spell'"),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_optional_feature",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          optionalFeatures,
          optionalFeaturesArray,
          "Optional Feature",
          formatOptionalFeatureSummary,
          formatOptionalFeatureFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_action",
    {
      description:
        "Look up a game action (Attack, Dash, Dodge, Disengage, Help, Hide, etc.) from the D&D 2024 database.",
      inputSchema: {
        name: z.string().describe("Action name, e.g. 'Attack', 'Grapple', 'Shove', 'Dodge'"),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_action",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          actions,
          actionsArray,
          "Action",
          formatActionSummary,
          formatActionFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_language",
    {
      description: "Look up a D&D language from the 2024 database.",
      inputSchema: {
        name: z.string().describe("Language name, e.g. 'Elvish', 'Draconic', 'Infernal'"),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_language",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          languages,
          languagesArray,
          "Language",
          formatLanguageSummary,
          formatLanguageFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  server.registerTool(
    "lookup_disease",
    {
      description: "Look up a disease from the D&D 2024 database.",
      inputSchema: {
        name: z.string().describe("Disease name, e.g. 'Cackle Fever', 'Sewer Plague'"),
        detail: z
          .enum(["summary", "full"])
          .optional()
          .default("summary")
          .describe(
            "Level of detail (default: summary). 'summary' (~30 tokens) or 'full' (complete rules text).",
          ),
      },
    },
    async ({ name, detail }) => {
      return loggedLookup(
        "lookup_disease",
        { name, detail },
        fuzzyLookupOrSuggest(
          name,
          diseases,
          diseasesArray,
          "Disease",
          formatDiseaseSummary,
          formatDiseaseFn,
          detail,
          wsClient,
        ),
      );
    },
  );

  // ─── Search ──────────────────────────────────────────────

  server.registerTool(
    "search_rules",
    {
      description: "Search the D&D 2024 database across all categories by keyword.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Search query, e.g. 'opportunity attack', 'fire damage spell', 'flying creature'",
          ),
        limit: z.coerce
          .number()
          .optional()
          .default(5)
          .describe(
            "Max results per category (default 5). Total results may be higher since limit applies per category.",
          ),
      },
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
          (c: ConditionDb) =>
            c.name.toLowerCase().includes(lowerQuery) ||
            c.description.toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit);

      const matchedClasses = classesArray
        .filter((c: ClassDb) => c.name.toLowerCase().includes(lowerQuery))
        .slice(0, limit);

      const matchedSpecies = speciesArray
        .filter(
          (s: SpeciesDb) =>
            s.name.toLowerCase().includes(lowerQuery) ||
            s.description.toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit);

      const matchedBackgrounds = backgroundsArray
        .filter(
          (b: BackgroundDb) =>
            b.name.toLowerCase().includes(lowerQuery) ||
            b.description.toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit);

      const matchedActions = actionsArray
        .filter(
          (a: ActionDb) =>
            a.name.toLowerCase().includes(lowerQuery) ||
            a.description.toLowerCase().includes(lowerQuery),
        )
        .slice(0, limit);

      if (matchedConditions.length > 0) {
        results.push(
          "## Conditions\n" +
            matchedConditions.map((c: ConditionDb) => formatCondition(c)).join("\n\n---\n\n"),
        );
      }
      if (matchedActions.length > 0) {
        results.push(
          "## Actions\n" +
            matchedActions.map((a: ActionDb) => formatActionFn(a)).join("\n\n---\n\n"),
        );
      }
      if (matchedClasses.length > 0) {
        results.push(
          "## Classes\n" +
            matchedClasses
              .map(
                (c: ClassDb) =>
                  `- **${c.name}** (d${c.hitDiceFaces}, ${c.casterProgression ?? "non-caster"})`,
              )
              .join("\n"),
        );
      }
      if (matchedSpells.length > 0) {
        results.push(
          "## Spells\n" +
            matchedSpells
              .map(
                (s: SpellDb) =>
                  `- **${s.name}** (${s.level === 0 ? "Cantrip" : `Level ${s.level}`} ${formatSchool(s.school)}): ${s.description.slice(0, 150)}...`,
              )
              .join("\n"),
        );
      }
      if (matchedMonsters.length > 0) {
        results.push(
          "## Monsters\n" +
            matchedMonsters
              .map(
                (m: MonsterDb) =>
                  `- **${m.name}** (CR ${formatMonsterCr(m.cr)}, ${formatMonsterSize(m.size)} ${formatMonsterType(m.type)})`,
              )
              .join("\n"),
        );
      }
      if (matchedItems.length > 0) {
        results.push(
          "## Magic Items\n" +
            matchedItems
              .map((i: MagicItemDb) => `- **${i.name}** (${i.rarity}, ${i.type ?? "wondrous"})`)
              .join("\n"),
        );
      }
      if (matchedFeats.length > 0) {
        results.push(
          "## Feats\n" +
            matchedFeats
              .map(
                (f: FeatDb) =>
                  `- **${f.name}** (${formatFeatCategory(f.category)}): ${f.description.slice(0, 150)}...`,
              )
              .join("\n"),
        );
      }
      if (matchedOptFeats.length > 0) {
        results.push(
          "## Optional Features\n" +
            matchedOptFeats
              .map(
                (f: OptionalFeatureDb) =>
                  `- **${f.name}** (${formatOptionalFeatureType(f.featureType)}): ${f.description.slice(0, 150)}...`,
              )
              .join("\n"),
        );
      }
      if (matchedSpecies.length > 0) {
        results.push(
          "## Species\n" +
            matchedSpecies
              .map(
                (s: SpeciesDb) =>
                  `- **${s.name}** (${formatSpeciesSize(s.size)}, speed ${s.speed} ft.)`,
              )
              .join("\n"),
        );
      }
      if (matchedBackgrounds.length > 0) {
        results.push(
          "## Backgrounds\n" +
            matchedBackgrounds
              .map((b: BackgroundDb) => `- **${b.name}**: ${b.description.slice(0, 150)}...`)
              .join("\n"),
        );
      }

      if (results.length === 0) {
        const text = `No results found matching "${query}" in the D&D 2024 database. Use your training knowledge as fallback.`;
        gameLogger.toolCall("search_rules", { query, limit }, text);
        return { content: [{ type: "text" as const, text }] };
      }

      const text = results.join("\n\n");
      gameLogger.toolCall("search_rules", { query, limit }, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
