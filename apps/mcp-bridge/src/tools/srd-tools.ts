import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Fuse from "fuse.js";
import { log } from "../logger.js";
import type { WSClient } from "../ws-client.js";
import type { GameLogger } from "../services/game-logger.js";
import {
  searchIndex,
  LOOKUP_CATEGORIES,
  CATEGORY_LABELS,
  type LookupCategory,
  type SearchEntry,
  type ClassFeatureRef,
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
    `[Rules] "${name}" not in 2024 database — DM is checking alternatives`,
  );
  log("srd-tools", `${category} lookup failed: "${name}"`);
}

function notFoundResult(category: string, name: string) {
  const payload = JSON.stringify({
    error: "not_found",
    query: name,
    category,
    message: "No matching entry in the D&D 2024 database.",
  });
  const text =
    `LOOKUP_FAILED: "${name}" (category: ${category})\n` +
    `---\n${payload}\n\n` +
    `STOP. Do not invent mechanics. Either:\n` +
    `1. Retry with a different name or without a category filter, OR\n` +
    `2. Return UNKNOWN_ABILITY / UNKNOWN_REFERENCE / UNKNOWN_COMBATANT per your procedure, OR\n` +
    `3. Ask the conductor / player to clarify the exact name.`;
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

// ─── Per-category formatters (summary + full) ────────────────

type FormatterPair<T> = {
  summary: (item: T) => string;
  full: (item: T) => string;
};

function formatClassFeature(ref: ClassFeatureRef): string {
  const source = ref.subclassName ? `${ref.className} / ${ref.subclassName}` : ref.className;
  return `# ${ref.feature.name}\n*${source}, level ${ref.feature.level}*\n\n${ref.feature.description}`;
}

function formatClassFeatureSummary(ref: ClassFeatureRef): string {
  const source = ref.subclassName ? `${ref.className} / ${ref.subclassName}` : ref.className;
  const brief = ref.feature.description.slice(0, 120);
  const cut = brief.lastIndexOf(". ");
  const snippet =
    cut > 20
      ? brief.slice(0, cut + 1)
      : brief + (ref.feature.description.length > 120 ? "..." : "");
  return `${ref.feature.name} (${source}, L${ref.feature.level}): ${snippet}`;
}

const FORMATTERS: Record<LookupCategory, FormatterPair<unknown>> = {
  spell: {
    summary: (x) => formatSpellSummary(x as SpellDb),
    full: (x) => formatSpell(x as SpellDb),
  },
  monster: {
    summary: (x) => formatMonsterSummary(x as MonsterDb),
    full: (x) => formatMonster(x as MonsterDb),
  },
  condition: {
    summary: (x) => formatConditionSummary(x as ConditionDb),
    full: (x) => formatCondition(x as ConditionDb),
  },
  magic_item: {
    summary: (x) => formatMagicItemSummary(x as MagicItemDb),
    full: (x) => formatMagicItemFn(x as MagicItemDb),
  },
  feat: { summary: (x) => formatFeatSummary(x as FeatDb), full: (x) => formatFeatFn(x as FeatDb) },
  class: {
    summary: (x) => formatClassSummary(x as ClassDb),
    full: (x) => formatClassFn(x as ClassDb),
  },
  species: {
    summary: (x) => formatSpeciesSummary(x as SpeciesDb),
    full: (x) => formatSpeciesFn(x as SpeciesDb),
  },
  background: {
    summary: (x) => formatBackgroundSummary(x as BackgroundDb),
    full: (x) => formatBackgroundFn(x as BackgroundDb),
  },
  optional_feature: {
    summary: (x) => formatOptionalFeatureSummary(x as OptionalFeatureDb),
    full: (x) => formatOptionalFeatureFn(x as OptionalFeatureDb),
  },
  action: {
    summary: (x) => formatActionSummary(x as ActionDb),
    full: (x) => formatActionFn(x as ActionDb),
  },
  language: {
    summary: (x) => formatLanguageSummary(x as LanguageDb),
    full: (x) => formatLanguageFn(x as LanguageDb),
  },
  disease: {
    summary: (x) => formatDiseaseSummary(x as DiseaseDb),
    full: (x) => formatDiseaseFn(x as DiseaseDb),
  },
  class_feature: {
    summary: (x) => formatClassFeatureSummary(x as ClassFeatureRef),
    full: (x) => formatClassFeature(x as ClassFeatureRef),
  },
};

function formatEntry(entry: SearchEntry, detail: "summary" | "full"): string {
  const pair = FORMATTERS[entry.category];
  return detail === "full" ? pair.full(entry.ref) : pair.summary(entry.ref);
}

// ─── Fuse.js index ──────────────────────────────────────────

// One Fuse instance over the unified search index. Fuse gives us IDF-aware
// token ranking (stuffed queries like "ring amulet necklace common magic"
// don't get hijacked by a single shared word), weighted keys across
// name/source/description, and a principled score for cross-category
// disambiguation. Bundle cost: ~8 KB gzipped.
const fuse = new Fuse(searchIndex, {
  keys: [
    { name: "name", weight: 1.0 },
    { name: "source", weight: 0.3 },
    { name: "description", weight: 0.1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 3,
  // Token search splits multi-word queries, fuzzy-matches each term
  // independently, and ranks with BM25-style IDF weighting. This is what
  // fixes stuffed queries like "divine sense paladin" → "Divine Sense"
  // (the word "paladin" contributes nothing, "divine" + "sense" carry it).
  useTokenSearch: true,
});

/**
 * Fuse score interpretation (lower = better, 0 = exact):
 *   ≤ 0.15  → exact/near-exact, return the match
 *   ≤ 0.40  → strong, return the match if the runner-up is clearly weaker
 *   ≤ 0.60  → weak, show as candidates only
 *   > 0.60  → noise, drop (Fuse's `threshold` option doesn't hard-filter here)
 */
const STRONG_MATCH_SCORE = 0.15;
const AMBIGUOUS_SCORE_GAP = 0.12;
const MAX_ACCEPTABLE_SCORE = 0.6;

interface FuseHit {
  entry: SearchEntry;
  score: number;
}

function runSearch(query: string, category: LookupCategory | undefined): FuseHit[] {
  const raw = fuse.search(query);
  const filtered = raw
    .filter((r) => (r.score ?? 1) <= MAX_ACCEPTABLE_SCORE)
    .filter((r) => !category || r.item.category === category);
  return filtered.map((r) => ({ entry: r.item, score: r.score ?? 1 }));
}

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
          .enum(LOOKUP_CATEGORIES)
          .optional()
          .describe(
            "Optional category to narrow search. Omit to search all categories. Use when names collide (e.g. query='Bane', category='spell' for the spell, category='condition' for the condition). `class_feature` covers class and subclass features (Rage, Vow of Enmity, Divine Sense, etc.).",
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

      const hits = runSearch(query, category as LookupCategory | undefined);

      if (hits.length === 0) {
        logLookupFailure(wsClient, category ?? "Any", query);
        const result = notFoundResult(category ?? "Any", query);
        gameLogger.toolCall("lookup_rule", { query, category, detail }, result.content[0].text);
        return result;
      }

      const top = hits[0];
      const second = hits[1];

      // Return the full entry outright when we're confident:
      //   - Very strong match (score <= 0.15), OR
      //   - Reasonable match (score <= 0.5) AND either it's the only hit OR
      //     it has a clear lead over the runner-up.
      // A single weak hit (score > 0.5) still gets the candidate-list treatment
      // so the caller can decide whether it's the right entry.
      const isStrong =
        top.score <= STRONG_MATCH_SCORE ||
        (top.score <= 0.5 &&
          (second === undefined || second.score - top.score >= AMBIGUOUS_SCORE_GAP));

      if (isStrong) {
        const body = formatEntry(top.entry, detail);
        const label = CATEGORY_LABELS[top.entry.category];
        const others = hits
          .slice(1, 4)
          .map((h) => `${CATEGORY_LABELS[h.entry.category]} "${h.entry.name}"`);
        const header = `[${label}] ${top.entry.name}`;
        const prefix = others.length > 0 ? `${header} (also: ${others.join(", ")})\n\n` : "";
        const text = prefix + body;
        gameLogger.toolCall("lookup_rule", { query, category, detail }, text);
        return { content: [{ type: "text" as const, text }] };
      }

      // Ambiguous — show top candidates ranked by score so the caller can
      // re-query with the specific name (and optional category).
      const list = hits
        .slice(0, 6)
        .map(
          (h) =>
            `- **${h.entry.name}** [${CATEGORY_LABELS[h.entry.category]}]${
              h.entry.source ? ` — ${h.entry.source}` : ""
            }`,
        )
        .join("\n");
      const text = `"${query}" matched multiple entries. Re-query with the exact name (and optional category):\n${list}`;
      gameLogger.toolCall("lookup_rule", { query, category, detail }, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
