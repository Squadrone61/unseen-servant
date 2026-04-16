import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { log } from "../logger.js";
import type { WSClient } from "../ws-client.js";
import type { GameLogger } from "../services/game-logger.js";
import {
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

/** Extract proficiency properties from the L1 Proficiencies feature or class-level effects. */
function getClassProficiencies(c: ClassDb): {
  saves: string[];
  armor: string[];
  weapons: string[];
  tools: string[];
} {
  // Prefer L1 "Proficiencies" feature; fall back to class-level effects
  const l1Feat = c.features.find((f) => f.name === "Proficiencies" && f.level === 1);
  const props = l1Feat?.effects?.properties ?? c.effects?.properties ?? [];
  const saves: string[] = [];
  const armor: string[] = [];
  const weapons: string[] = [];
  const tools: string[] = [];
  for (const p of props) {
    if (p.type !== "proficiency") continue;
    switch (p.category) {
      case "save":
        saves.push(p.value);
        break;
      case "armor":
        armor.push(p.value);
        break;
      case "weapon":
        weapons.push(p.value);
        break;
      case "tool":
        tools.push(p.value);
        break;
    }
  }
  return { saves, armor, weapons, tools };
}

function formatClassSummary(c: ClassDb): string {
  const { saves, armor } = getClassProficiencies(c);
  const parts: string[] = [
    `${c.name}: d${c.hitDiceFaces} HD`,
    ...(saves.length ? [`Saves: ${saves.join("/")}`] : []),
  ];
  if (armor.length) parts.push(armor.join(", "));
  if (c.casterProgression) parts.push(`${c.casterProgression} caster`);
  else parts.push("non-caster");
  parts.push(`${c.subclasses.length} subclasses`);
  return parts.join(" | ");
}

function formatClassFn(c: ClassDb): string {
  const { saves, armor, weapons, tools } = getClassProficiencies(c);
  let text = `# ${c.name}\n\n`;
  text += `**Hit Die:** d${c.hitDiceFaces}\n`;
  if (saves.length) text += `**Saving Throws:** ${saves.join(", ")}\n`;
  if (armor.length) text += `**Armor Proficiencies:** ${armor.join(", ")}\n`;
  if (weapons.length) text += `**Weapon Proficiencies:** ${weapons.join(", ")}\n`;
  if (tools.length) text += `**Tool Proficiencies:** ${tools.join(", ")}\n`;
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

/** Extract darkvision range (if any) from species effects properties. */
function getSpeciesDarkvision(s: SpeciesDb): number | undefined {
  const props = s.effects?.properties ?? [];
  const sense = props.find(
    (p) => p.type === "sense" && (p as { sense?: string }).sense === "darkvision",
  );
  return sense ? (sense as { range: number }).range : undefined;
}

function formatSpeciesSummary(s: SpeciesDb): string {
  const parts: string[] = [`${s.name}: ${formatSpeciesSize(s.size)}, ${s.speed} ft.`];
  const dv = getSpeciesDarkvision(s);
  if (dv) parts.push(`Darkvision ${dv} ft.`);
  return parts.join(" | ");
}

function formatSpeciesFn(s: SpeciesDb): string {
  let text = `# ${s.name}\n\n`;
  text += `**Size:** ${formatSpeciesSize(s.size)}\n`;
  text += `**Speed:** ${s.speed} ft.\n`;
  const dv = getSpeciesDarkvision(s);
  if (dv) text += `**Darkvision:** ${dv} ft.\n`;
  text += `\n**Description:**\n${s.description}`;
  return text;
}

/** Extract skill and tool proficiencies from background effects properties. */
function getBackgroundProficiencies(b: BackgroundDb): { skills: string[]; tools: string[] } {
  const props = b.effects?.properties ?? [];
  const skills: string[] = [];
  const tools: string[] = [];
  for (const p of props) {
    if (p.type !== "proficiency") continue;
    if (p.category === "skill") skills.push(p.value);
    else if (p.category === "tool") tools.push(p.value);
  }
  return { skills, tools };
}

function formatBackgroundSummary(b: BackgroundDb): string {
  const { skills, tools } = getBackgroundProficiencies(b);
  const parts: string[] = [b.name + ":"];
  if (skills.length) parts.push(skills.join(" + "));
  if (tools.length) parts.push(tools.join(", "));
  if (b.feat) parts.push(`Feat: ${b.feat}`);
  return parts.join(" | ");
}

function formatBackgroundFn(b: BackgroundDb): string {
  const { skills, tools } = getBackgroundProficiencies(b);
  let text = `# ${b.name}\n\n`;
  text += b.description + "\n\n";
  if (skills.length) text += `**Skill Proficiencies:** ${skills.join(", ")}\n`;
  if (tools.length) text += `**Tool Proficiencies:** ${tools.join(", ")}\n`;
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

// ─── Category Dispatch Table ────────────────────────────────

interface CategoryEntry<T extends { name: string }> {
  label: string;
  exactMap: Map<string, T>;
  allItems: T[];
  formatSummary: (item: T) => string;
  formatFull: (item: T) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCategory = CategoryEntry<any>;

const CATEGORIES: Record<string, AnyCategory> = {
  spell: {
    label: "Spell",
    exactMap: spells,
    allItems: spellsArray,
    formatSummary: formatSpellSummary,
    formatFull: formatSpell,
  },
  monster: {
    label: "Monster",
    exactMap: monsters,
    allItems: monstersArray,
    formatSummary: formatMonsterSummary,
    formatFull: formatMonster,
  },
  condition: {
    label: "Condition",
    exactMap: conditions,
    allItems: conditionsArray,
    formatSummary: formatConditionSummary,
    formatFull: formatCondition,
  },
  magic_item: {
    label: "Magic Item",
    exactMap: magicItems,
    allItems: magicItemsArray,
    formatSummary: formatMagicItemSummary,
    formatFull: formatMagicItemFn,
  },
  feat: {
    label: "Feat",
    exactMap: feats,
    allItems: featsArray,
    formatSummary: formatFeatSummary,
    formatFull: formatFeatFn,
  },
  class: {
    label: "Class",
    exactMap: classes,
    allItems: classesArray,
    formatSummary: formatClassSummary,
    formatFull: formatClassFn,
  },
  species: {
    label: "Species",
    exactMap: species,
    allItems: speciesArray,
    formatSummary: formatSpeciesSummary,
    formatFull: formatSpeciesFn,
  },
  background: {
    label: "Background",
    exactMap: backgrounds,
    allItems: backgroundsArray,
    formatSummary: formatBackgroundSummary,
    formatFull: formatBackgroundFn,
  },
  optional_feature: {
    label: "Optional Feature",
    exactMap: optionalFeatures,
    allItems: optionalFeaturesArray,
    formatSummary: formatOptionalFeatureSummary,
    formatFull: formatOptionalFeatureFn,
  },
  action: {
    label: "Action",
    exactMap: actions,
    allItems: actionsArray,
    formatSummary: formatActionSummary,
    formatFull: formatActionFn,
  },
  language: {
    label: "Language",
    exactMap: languages,
    allItems: languagesArray,
    formatSummary: formatLanguageSummary,
    formatFull: formatLanguageFn,
  },
  disease: {
    label: "Disease",
    exactMap: diseases,
    allItems: diseasesArray,
    formatSummary: formatDiseaseSummary,
    formatFull: formatDiseaseFn,
  },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Match quality tiers (higher = better)
const MATCH_RANK: Record<string, number> = { exact: 4, substring: 3, word: 2, levenshtein: 1 };

// ─── Tool Registration ──────────────────────────────────────

export function registerSrdTools(
  server: McpServer,
  wsClient: WSClient,
  gameLogger: GameLogger,
): void {
  server.registerTool(
    "lookup_rule",
    {
      description:
        "Look up ANY D&D 2024 rule, entity, or concept from the unified database. Searches spells, monsters, conditions, magic items, feats, classes, species, backgrounds, optional features, actions, languages, and diseases — all in one tool. Provide an optional `category` to narrow results when names collide across categories (e.g. Bane is both a spell and a condition). Fuzzy matching auto-corrects typos and close matches.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Name or search term, e.g. 'Fireball', 'Goblin', 'Grappled', 'Great Weapon Master'. Fuzzy matching handles typos.",
          ),
        category: z
          .enum([
            "spell",
            "monster",
            "condition",
            "magic_item",
            "feat",
            "class",
            "species",
            "background",
            "optional_feature",
            "action",
            "language",
            "disease",
          ])
          .optional()
          .describe(
            "Optional category to narrow search. Omit to search all categories. Use when names collide (e.g. query='Bane', category='spell' for the spell, category='condition' for the condition).",
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
    async ({ query, category, detail }) => {
      wsClient.pingActivity("The DM consults the rulebooks…");

      // Category-scoped lookup
      if (category) {
        const cat = CATEGORIES[category];
        if (!cat) {
          const text = `Unknown category "${category}". Valid: ${CATEGORY_KEYS.join(", ")}`;
          gameLogger.toolCall("lookup_rule", { query, category, detail }, text);
          return { content: [{ type: "text" as const, text }] };
        }
        const result = fuzzyLookupOrSuggest(
          query,
          cat.exactMap,
          cat.allItems,
          cat.label,
          cat.formatSummary,
          cat.formatFull,
          detail,
          wsClient,
        );
        const text = result.content[0]?.text ?? "";
        gameLogger.toolCall("lookup_rule", { query, category, detail }, text);
        return result;
      }

      // Cross-category search: run fuzzyLookup on each, collect best
      type Hit = { category: string; label: string; name: string; rank: number; text: string };
      const hits: Hit[] = [];

      for (const [key, cat] of Object.entries(CATEGORIES)) {
        const result = fuzzyLookup(query, cat.exactMap, cat.allItems);
        if (result.match) {
          const rank = MATCH_RANK[result.matchType] ?? 0;
          const formatted =
            detail === "full" ? cat.formatFull(result.match) : cat.formatSummary(result.match);
          hits.push({
            category: key,
            label: cat.label,
            name: result.match.name,
            rank,
            text: formatted,
          });
        }
      }

      if (hits.length === 0) {
        logLookupFailure(wsClient, "Any", query);
        const result = notFoundResult("Any", query);
        gameLogger.toolCall("lookup_rule", { query, detail }, result.content[0].text);
        return result;
      }

      // Sort by match quality
      hits.sort((a, b) => b.rank - a.rank);
      const best = hits[0];

      // If the top hit is exact or unique, return it directly
      const sameRank = hits.filter((h) => h.rank === best.rank);
      if (sameRank.length === 1 || best.rank >= MATCH_RANK.substring) {
        const prefix =
          hits.length > 1
            ? `[${best.label}] (also found in: ${hits
                .slice(1, 4)
                .map((h) => `${h.label} "${h.name}"`)
                .join(", ")})\n\n`
            : "";
        const text = prefix + best.text;
        gameLogger.toolCall("lookup_rule", { query, detail }, text);
        return { content: [{ type: "text" as const, text }] };
      }

      // Ambiguous: multiple categories at the same match tier
      const list = sameRank.map((h) => `- **${h.name}** [${h.label}]`).join("\n");
      const text = `"${query}" matched in multiple categories. Specify a \`category\` to disambiguate:\n${list}`;
      gameLogger.toolCall("lookup_rule", { query, detail }, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
