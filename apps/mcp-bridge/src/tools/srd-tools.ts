import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { log } from "../logger.js";
import type { WSClient } from "../ws-client.js";
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

function formatSpellSummary(s: SpellData): string {
  const parts: string[] = [
    `${s.name}: ${formatSpellLevel(s)} ${formatSchool(s.school).toLowerCase()}`,
  ];
  parts.push(`Range: ${formatRange(s.range)}`);
  // Extract area from entries text (look for common patterns like "Xft sphere/cone/cube/line/cylinder")
  const entriesText = entriesToText(s.entries);
  const areaMatch = entriesText.match(
    /(\d+-foot(?:-radius)?)\s+(sphere|cone|cube|line|cylinder|emanation)/i,
  );
  if (areaMatch) parts.push(`${areaMatch[1]} ${areaMatch[2]}`);
  // Damage/effect + save
  if (s.damageInflict?.length) {
    const dmgMatch = entriesText.match(/(\d+d\d+)\s/);
    const dmgStr = dmgMatch
      ? `${dmgMatch[1]} ${s.damageInflict.join("/")}`
      : s.damageInflict.join("/");
    if (s.savingThrow?.length) {
      parts.push(`${dmgStr}, ${s.savingThrow.map((st) => st.toUpperCase()).join("/")} save half`);
    } else {
      parts.push(dmgStr);
    }
  } else if (s.savingThrow?.length) {
    parts.push(`${s.savingThrow.map((st) => st.toUpperCase()).join("/")} save`);
  } else if (s.spellAttack?.length) {
    parts.push(`spell attack (${s.spellAttack.join("/")})`);
  }
  parts.push(formatComponents(s));
  parts.push(`Conc: ${isConcentration(s) ? "Yes" : "No"}`);
  if (isRitual(s)) parts.push("Ritual");
  return parts.join(" | ");
}

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

function formatMonsterSummary(m: MonsterData): string {
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

function formatConditionSummary(c: ConditionData): string {
  const fullText = entriesToText(c.entries);
  // Take the first ~120 chars, cut at sentence boundary if possible
  let summary = fullText.slice(0, 150);
  const sentenceEnd = summary.lastIndexOf(". ");
  if (sentenceEnd > 40) summary = summary.slice(0, sentenceEnd + 1);
  else if (summary.length >= 150) summary += "...";
  return `${c.name}: ${summary}`;
}

function formatCondition(c: ConditionData): string {
  let text = `# ${c.name}\n\n${entriesToText(c.entries)}`;
  text += `\n\n*Source: ${c.source}*`;
  return text;
}

function formatMagicItemSummary(item: MagicItemData): string {
  const parts: string[] = [`${item.name}: ${item.type ?? "Wondrous item"}, ${item.rarity}`];
  if (item.reqAttune) {
    parts.push(typeof item.reqAttune === "string" ? `attunement ${item.reqAttune}` : "attunement");
  }
  if (item.bonusAc) parts.push(`AC +${item.bonusAc}`);
  if (item.bonusWeapon) parts.push(`Weapon +${item.bonusWeapon}`);
  if (item.bonusSpellAttack) parts.push(`Spell Attack +${item.bonusSpellAttack}`);
  if (item.charges) parts.push(`${item.charges} charges`);
  // Brief description from entries
  const desc = entriesToText(item.entries);
  const brief = desc.slice(0, 100);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (desc.length > 100 ? "..." : ""));
  return parts.join(" | ");
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

function formatFeatSummary(f: FeatData): string {
  const parts: string[] = [`${f.name}: ${formatFeatCategory(f.category)} feat`];
  if (f.prerequisite?.length) parts.push(`Prereq: ${formatPrerequisite(f.prerequisite)}`);
  // Brief mechanical description
  const desc = entriesToText(f.entries);
  const brief = desc.slice(0, 120);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (desc.length > 120 ? "..." : ""));
  return parts.join(" | ");
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

function formatClassSummary(c: ClassAssembled): string {
  const primaryAbs = c.primaryAbility.flatMap((a) =>
    Object.keys(a)
      .filter((k) => a[k])
      .map((k) => ABILITY_MAP[k] ?? k),
  );
  const parts: string[] = [`${c.name}: ${getHitDice(c)} HD`, `${primaryAbs.join("/")} primary`];
  const armorProfs = getArmorProfs(c);
  if (armorProfs.length) parts.push(armorProfs.join(", "));
  const casterType = getCasterType(c);
  if (casterType) parts.push(casterType);
  else parts.push("non-caster");
  parts.push(`${c.resolvedSubclasses.length} subclasses`);
  return parts.join(" | ");
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

function formatSpeciesSummary(s: SpeciesData): string {
  const parts: string[] = [`${s.name}: ${formatSpeciesSize(s.size)}, ${getSpeciesSpeed(s)} ft.`];
  if (s.darkvision) parts.push(`Darkvision ${s.darkvision} ft.`);
  if (s.resist?.length) {
    const resistances = s.resist
      .map((r) => (typeof r === "string" ? r : `choose ${r.choose.from.join("/")}`))
      .join(", ");
    parts.push(`${resistances} resistance`);
  }
  return parts.join(" | ");
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

function formatBackgroundSummary(b: BackgroundData): string {
  const parts: string[] = [b.name + ":"];
  const skills = getBackgroundSkills(b);
  if (skills.length) parts.push(skills.join(" + "));
  const tools = getBackgroundTools(b);
  if (tools.length) parts.push(tools.join(", "));
  const feat = getBackgroundFeat(b);
  if (feat) parts.push(`Feat: ${feat}`);
  return parts.join(" | ");
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

function formatOptionalFeatureSummary(f: OptionalFeatureData): string {
  const parts: string[] = [`${f.name}: ${formatOptionalFeatureType(f.featureType)}`];
  if (f.prerequisite?.length) parts.push(`Prereq: ${formatPrerequisite(f.prerequisite)}`);
  const desc = entriesToText(f.entries);
  const brief = desc.slice(0, 120);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (desc.length > 120 ? "..." : ""));
  return parts.join(" | ");
}

function formatOptionalFeatureFn(f: OptionalFeatureData): string {
  let text = `# ${f.name}\n*${formatOptionalFeatureType(f.featureType)}*`;
  if (f.prerequisite?.length) text += ` *(Prerequisite: ${formatPrerequisite(f.prerequisite)})*`;
  text += "\n\n";
  text += entriesToText(f.entries);
  text += `\n\n*Source: ${f.source}*`;
  return text;
}

function formatActionSummary(a: ActionData): string {
  const parts: string[] = [a.name + ":"];
  if (a.time?.length) {
    parts.push(a.time.map((t) => `${t.number} ${t.unit}`).join(", "));
  }
  const desc = entriesToText(a.entries);
  const brief = desc.slice(0, 120);
  const sentenceEnd = brief.lastIndexOf(". ");
  if (sentenceEnd > 20) parts.push(brief.slice(0, sentenceEnd + 1));
  else parts.push(brief + (desc.length > 120 ? "..." : ""));
  return parts.join(" | ");
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

function formatLanguageSummary(l: LanguageData): string {
  const parts: string[] = [`${l.name}: ${l.type} language`];
  if (l.typicalSpeakers?.length) parts.push(`Spoken by ${l.typicalSpeakers.join(", ")}`);
  if (l.script) parts.push(`${l.script} script`);
  return parts.join(" | ");
}

function formatLanguageFn(l: LanguageData): string {
  let text = `# ${l.name}\n*${l.type} language*\n\n`;
  if (l.typicalSpeakers?.length) text += `**Typical Speakers:** ${l.typicalSpeakers.join(", ")}\n`;
  if (l.script) text += `**Script:** ${l.script}\n`;
  if (l.entries) text += "\n" + entriesToText(l.entries);
  text += `\n\n*Source: ${l.source}*`;
  return text;
}

function formatDiseaseSummary(d: DiseaseData): string {
  const desc = entriesToText(d.entries);
  const brief = desc.slice(0, 150);
  const sentenceEnd = brief.lastIndexOf(". ");
  let summary: string;
  if (sentenceEnd > 20) summary = brief.slice(0, sentenceEnd + 1);
  else summary = brief + (desc.length > 150 ? "..." : "");
  return `${d.name}: ${summary}`;
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

export function registerSrdTools(server: McpServer, wsClient: WSClient): void {
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
      return fuzzyLookupOrSuggest(
        name,
        spells,
        spellsArray,
        "Spell",
        formatSpellSummary,
        formatSpell,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        monsters,
        monstersArray,
        "Monster",
        formatMonsterSummary,
        formatMonster,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        conditions,
        conditionsArray,
        "Condition",
        formatConditionSummary,
        formatCondition,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        magicItems,
        magicItemsArray,
        "Magic Item",
        formatMagicItemSummary,
        formatMagicItemFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        feats,
        featsArray,
        "Feat",
        formatFeatSummary,
        formatFeatFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        classes,
        classesArray,
        "Class",
        formatClassSummary,
        formatClassFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        species,
        speciesArray,
        "Species",
        formatSpeciesSummary,
        formatSpeciesFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        backgrounds,
        backgroundsArray,
        "Background",
        formatBackgroundSummary,
        formatBackgroundFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        optionalFeatures,
        optionalFeaturesArray,
        "Optional Feature",
        formatOptionalFeatureSummary,
        formatOptionalFeatureFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        actions,
        actionsArray,
        "Action",
        formatActionSummary,
        formatActionFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        languages,
        languagesArray,
        "Language",
        formatLanguageSummary,
        formatLanguageFn,
        detail,
        wsClient,
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
      return fuzzyLookupOrSuggest(
        name,
        diseases,
        diseasesArray,
        "Disease",
        formatDiseaseSummary,
        formatDiseaseFn,
        detail,
        wsClient,
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
