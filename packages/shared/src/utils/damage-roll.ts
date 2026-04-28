/**
 * Damage roll resolver — auto-build damage notation + breakdown for a character
 * using a weapon, spell, feature, or other DB action.
 *
 * The DM provides an `action_ref` (what is being rolled) plus optional flags
 * (crit, upcast, ability override, opt-in extras). This helper resolves:
 *   - Base dice from action.onHit / onFailedSave damage entries. Dice expressions
 *     can embed ability mods directly via the value-notation language — e.g.
 *     "1d6 + spell_mod" for Magic Stone, "table(3:1d6, 5:1d8) + int" for Psi Strike.
 *   - Wielder's ability modifier for weapon attacks (STR / DEX / max(STR,DEX)
 *     from weapon properties, or `ability` override). Spell ability mods are
 *     embedded in the dice expression via `spell_mod` — no flag needed.
 *   - Damage_* effect modifiers (Magic Weapon +1, Rage, Dueling, etc.) filtered
 *     by source-kind tag (melee/ranged/spell). Conditional `damage` parent
 *     modifiers (Hex/Hunter's Mark, which need a target match) are skipped from
 *     auto-apply and surfaced as hints — the DM opts in via `extras`.
 *   - Crit doubling: dice counts double; flat bonuses untouched.
 *   - Extras: opt-in damage from named sources (Sneak Attack, Smite, Hex, etc.).
 *
 * Non-goals: rolling, applying damage, narration. Returns a notation string and
 * a structured breakdown so the caller (roll_dice tool) can roll and format.
 */

import type { CharacterData } from "../types/character";
import type { Ability, ResolveContext } from "../types/effects";
import type { ActionRef } from "../data/resolve-action";
import { resolveActionRef } from "../data/resolve-action";
import { getAction, collectModifiersWithSource } from "./effect-resolver";
import { evaluateExpression } from "./expression-evaluator";
import { getAbilities, collectActiveBundles, buildCtx } from "../character/resolve";
import { getBaseItem } from "../data/index";

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

/**
 * One opt-in extra damage source — Sneak Attack, Smite, Hex, etc.
 * The DM passes these by structured ref; the resolver looks them up in the DB.
 */
export interface DamageRollExtra {
  /** Which DB category to search. */
  source: "spell" | "feature" | "feat" | "weapon" | "item" | "monster";
  /** Entity name (e.g. "Sneak Attack", "Hex", "Divine Smite"). */
  name: string;
  /**
   * Spell-slot upcast level (extra levels above base) — e.g. Smite at slot 3
   * is base 1 + 2 upcast levels.
   */
  upcastLevel?: number;
  /** Optional override of dice notation (escape hatch). */
  diceOverride?: string;
  /** Optional override of damage type. Defaults to weapon damage type for sneak-style extras. */
  typeOverride?: string;
}

export interface DamageRollOptions {
  /** Override the ability used for the weapon damage modifier (e.g. Monk Wisdom). */
  ability?: Ability;
  /** Spell-slot upcast level (extra levels above base) for the primary action_ref. */
  upcastLevel?: number;
  /** True doubles all dice counts (5e crit rule). Flat bonuses are untouched. */
  isCriticalHit?: boolean;
  /** Opt-in extras: Sneak Attack, Smite, Hex, etc. */
  extras?: DamageRollExtra[];
}

export interface DamageBreakdownEntry {
  label: string;
  dice?: string;
  flat?: number;
  damageType?: string;
}

export interface ComputedDamageRoll {
  /** Final dice notation ready to roll, e.g. "1d8+1d4+5". */
  notation: string;
  /** Structured breakdown of each contribution for human-readable output. */
  breakdown: DamageBreakdownEntry[];
  /** Primary damage type from the action's first damage entry, if any. */
  primaryDamageType?: string;
  /** Resolution errors (action not found, weapon not in DB, etc.). */
  errors: string[];
  /**
   * Hints about un-fired extras that the DM may want to opt into
   * (e.g. "Hunter's Mark active — pass extras: [{source:'spell', name:'Hunter\\'s Mark'}]").
   */
  hints: string[];
}

// ---------------------------------------------------------------------------
// Value resolution: split modifier values into flat + dice
// ---------------------------------------------------------------------------

/**
 * Parse a modifier value (number | expression) into a flat number plus dice
 * notation strings. Handles:
 *   - Plain numbers: 5 → { flat: 5, dice: [] }
 *   - Math expressions: "str + prof" → { flat: ability+prof, dice: [] }
 *   - Pure dice: "1d6" → { flat: 0, dice: ["1d6"] }
 *   - Mixed: "1d6 + str" → { flat: ability, dice: ["1d6"] }
 *   - Tables that resolve to dice: "table(1:1d6, 3:2d6)" → recurse on selected entry
 *   - Tables with mixed values: "table(3:1d6, 5:1d8) + int" → recurse + flat
 *
 * Negative dice (e.g. "-1d6") are not supported — they're vanishingly rare.
 */
export function resolveDamageValue(
  value: number | string,
  ctx: ResolveContext,
): { flat: number; dice: string[] } {
  if (typeof value === "number") return { flat: value, dice: [] };

  let flat = 0;
  const dice: string[] = [];
  for (const { sign, term } of splitTopLevelTerms(value)) {
    const part = resolveTerm(term, ctx);
    flat += sign * part.flat;
    if (sign > 0) {
      dice.push(...part.dice);
    }
    // Negative dice are dropped (5e doesn't have them in practice).
  }
  return { flat, dice };
}

/** Split an expression on top-level + and - operators (respecting parentheses). */
function splitTopLevelTerms(expr: string): Array<{ sign: 1 | -1; term: string }> {
  const terms: Array<{ sign: 1 | -1; term: string }> = [];
  let depth = 0;
  let current = "";
  let sign: 1 | -1 = 1;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && (ch === "+" || ch === "-") && current.trim() !== "") {
      terms.push({ sign, term: current.trim() });
      sign = ch === "+" ? 1 : -1;
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") terms.push({ sign, term: current.trim() });
  if (terms.length === 0 && expr.trim() !== "") {
    // Single negative-prefixed term: "-2", "-1d6"
    terms.push({ sign: 1, term: expr.trim() });
  }
  return terms;
}

/** Classify a single term and resolve it to flat + dice. */
function resolveTerm(term: string, ctx: ResolveContext): { flat: number; dice: string[] } {
  // Pure dice notation: "1d6", "2d8", "10d6"
  if (/^\d+d\d+$/i.test(term)) {
    return { flat: 0, dice: [term] };
  }

  // Try evaluating as math (numbers, ability mods, prof, lvl, table, etc.).
  // The expression evaluator returns a number on success.
  try {
    return { flat: evaluateExpression(term, ctx), dice: [] };
  } catch {
    // Fall through to table-with-dice handling.
  }

  // Table that may contain dice values: table(L:V, ...), table_lvl(...), table_prof(...)
  const tableMatch = /^(table|table_lvl|table_prof)\((.*)\)$/i.exec(term);
  if (tableMatch) {
    const fnName = tableMatch[1].toLowerCase();
    const args = tableMatch[2];
    const entries = parseTableEntries(args);
    const key =
      fnName === "table_prof"
        ? ctx.proficiencyBonus
        : fnName === "table_lvl"
          ? ctx.totalLevel
          : (ctx.classLevel ?? ctx.totalLevel);
    let chosen: { level: number; value: string } | undefined;
    for (const e of entries) {
      if (e.level <= key && (!chosen || e.level > chosen.level)) chosen = e;
    }
    if (!chosen) return { flat: 0, dice: [] };
    return resolveDamageValue(chosen.value, ctx);
  }

  // Unrecognized — contributes nothing. Better than throwing.
  return { flat: 0, dice: [] };
}

/** Parse "1:1d6, 3:2d6, 5:3d6" into table entries (respecting nested parens). */
function parseTableEntries(args: string): Array<{ level: number; value: string }> {
  const entries: Array<{ level: number; value: string }> = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i <= args.length; i++) {
    const ch = args[i];
    const atEnd = i === args.length;
    if (atEnd || (ch === "," && depth === 0)) {
      const trimmed = current.trim();
      if (trimmed) {
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx > 0) {
          const level = parseInt(trimmed.slice(0, colonIdx).trim(), 10);
          const value = trimmed.slice(colonIdx + 1).trim();
          if (!isNaN(level) && value) entries.push({ level, value });
        }
      }
      current = "";
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    current += ch;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Weapon ability selection
// ---------------------------------------------------------------------------

/**
 * Choose the ability used for a weapon's damage modifier based on weapon
 * properties. Returns null if the weapon is not in the base-item DB.
 *
 *   Finesse melee  → max(STR, DEX) by score
 *   Ranged thrown  → DEX (unless the weapon is finesse-thrown like Dagger; then max)
 *   Plain melee    → STR
 *   Plain ranged   → DEX
 *
 * Unarmed Strike defaults to STR; Monk's Dexterous Attacks isn't structured yet,
 * so the DM can pass `ability: "dexterity"` for monk weapon damage if needed.
 */
export function chooseWeaponAbility(char: CharacterData, weaponName: string): Ability | null {
  const base = getBaseItem(weaponName);
  if (!base) return null;
  const props = base.properties ?? [];
  const hasFinesse = props.includes("F");
  // Type prefix is "M" (melee) or "R" (ranged), with optional "|<source>" suffix.
  const typeBase = base.type?.split("|")[0];
  const isRanged = typeBase === "R";
  const abilities = getAbilities(char);
  const strScore = abilities.strength;
  const dexScore = abilities.dexterity;

  if (hasFinesse) {
    return strScore >= dexScore ? "strength" : "dexterity";
  }
  if (isRanged) return "dexterity";
  return "strength";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const ABILITY_ABBR: Record<Ability, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

function abilityModFromScore(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Resolve a complete damage roll for `char` using the provided action_ref.
 *
 * Flow:
 *   1. Resolve action_ref → ActionEffect (with upcast/cantrip scaling).
 *   2. Pick the damage outcome branch (onHit > onFailedSave).
 *   3. Determine source-kind (melee/ranged/spell) from action.attack.bonus.
 *   4. For each damage entry: dice + ability mod (if applicable) + damage_*
 *      effect bonuses (filtered by source-kind, skipping conditional 'damage' parent).
 *   5. Apply opt-in extras.
 *   6. Apply crit doubling to dice counts.
 *   7. Build final notation + breakdown + hints.
 */
export function computeDamageRoll(
  char: CharacterData,
  ref: ActionRef,
  options: DamageRollOptions = {},
): ComputedDamageRoll {
  const errors: string[] = [];
  const hints: string[] = [];
  const breakdown: DamageBreakdownEntry[] = [];
  const dicePieces: string[] = [];
  let flatTotal = 0;
  let primaryDamageType: string | undefined;

  const ctx = buildCtx(char);
  const bundles = collectActiveBundles(char);

  // 1. Resolve the action.
  const resolved = resolveActionRef(ref);
  if (!resolved.action) {
    errors.push(`No structured action found for ${ref.source} "${ref.name}"`);
    return { notation: "", breakdown, errors, hints };
  }

  // Apply upcast/cantrip scaling.
  const characterLevel = ctx.totalLevel;
  const action = getAction(
    { effects: { action: resolved.action } },
    {
      upcastLevel: options.upcastLevel,
      characterLevel,
    },
  );
  if (!action) {
    errors.push(`Action could not be contextualised for ${resolved.displayName}`);
    return { notation: "", breakdown, errors, hints };
  }

  // 2. Pick a damage outcome branch.
  // Save-based actions (Fireball, Burning Hands) damage on failed save.
  // Attack-based and auto actions damage on hit.
  const outcome =
    action.kind === "save" ? action.onFailedSave : (action.onHit ?? action.onFailedSave);
  const damageEntries = outcome?.damage ?? [];
  if (damageEntries.length === 0) {
    errors.push(`${resolved.displayName} has no damage entries to roll`);
    return { notation: "", breakdown, errors, hints };
  }

  // 3. Determine source-kind for filtering damage_* modifiers.
  const sourceKind = inferSourceKind(action, ref);

  // 4. Base weapon/spell dice.
  for (let i = 0; i < damageEntries.length; i++) {
    const entry = damageEntries[i];
    if (i === 0) primaryDamageType = entry.type;
    const expanded = resolveDamageValue(entry.dice, ctx);
    if (expanded.dice.length > 0) {
      const diceStr = expanded.dice.join("+");
      dicePieces.push(diceStr);
      breakdown.push({
        label: `${resolved.displayName} ${i === 0 ? "" : `(${entry.type})`}`.trim(),
        dice: diceStr,
        damageType: entry.type,
      });
    }
    if (expanded.flat !== 0) {
      flatTotal += expanded.flat;
      breakdown.push({
        label: `${resolved.displayName} expression`,
        flat: expanded.flat,
        damageType: entry.type,
      });
    }
  }

  // 5. Wielder's ability modifier for weapon attacks. Spell ability mods are
  //    embedded in the dice expression (`+ spell_mod`), already counted above.
  const abilityResult = computeWeaponAbilityMod(char, ref, action, options, ctx);
  if (abilityResult) {
    flatTotal += abilityResult.value;
    breakdown.push({
      label: `${ABILITY_ABBR[abilityResult.ability]} mod`,
      flat: abilityResult.value,
    });
  }

  // 6. damage_* effect modifiers (Magic Weapon, Rage, Dueling, etc.) — auto-apply.
  //    Filter by source-kind tag, skip conditional 'damage' parent (Hex/Hunter's Mark).
  if (sourceKind) {
    const targetKey = `damage_${sourceKind}` as const;
    const targetMods = collectModifiersWithSource(bundles, targetKey);
    for (const { modifier, source } of targetMods) {
      // Conditional 'damage' parent modifiers (Hex/Hunter's Mark) require target
      // match — surface as hints, don't auto-apply.
      if (modifier.target === "damage" && modifier.condition) {
        const sourceName = source.featureName ?? source.name;
        const refStr =
          source.type === "spell" ? `{source:'spell', name:'${sourceName}'}` : sourceName;
        hints.push(`${sourceName}: ${modifier.condition}. To include, pass extras: [${refStr}]`);
        continue;
      }
      const expanded = resolveDamageValue(modifier.value, ctx);
      const sourceLabel = source.featureName ?? source.name;
      if (expanded.dice.length > 0) {
        const diceStr = expanded.dice.join("+");
        dicePieces.push(diceStr);
        breakdown.push({ label: sourceLabel, dice: diceStr });
      }
      if (expanded.flat !== 0) {
        flatTotal += expanded.flat;
        breakdown.push({ label: sourceLabel, flat: expanded.flat });
      }
    }
  }

  // 7. Opt-in extras (Sneak Attack, Smite, Hex, Hunter's Mark, etc.).
  const extras = options.extras ?? [];
  for (const extra of extras) {
    const result = resolveExtra(char, extra, ctx, primaryDamageType);
    if (result.error) {
      errors.push(result.error);
      continue;
    }
    if (result.dice) {
      dicePieces.push(result.dice);
      breakdown.push({
        label: result.label,
        dice: result.dice,
        damageType: result.damageType,
      });
    }
    if (result.flat) {
      flatTotal += result.flat;
      breakdown.push({
        label: result.label,
        flat: result.flat,
        damageType: result.damageType,
      });
    }
  }

  // 8. Crit doubling: double the dice counts (modifiers untouched).
  let finalDicePieces = dicePieces;
  if (options.isCriticalHit) {
    finalDicePieces = dicePieces.map(doubleDice);
  }

  // 9. Build final notation.
  const notation = buildNotation(finalDicePieces, flatTotal);

  return { notation, breakdown, primaryDamageType, errors, hints };
}

// ---------------------------------------------------------------------------
// Helpers — source-kind inference, ability mod, extras, notation
// ---------------------------------------------------------------------------

type SourceKind = "melee" | "ranged" | "spell";

function inferSourceKind(
  action: NonNullable<ReturnType<typeof getAction>>,
  ref: ActionRef,
): SourceKind | null {
  const bonus = action.attack?.bonus;
  if (bonus === "weapon_melee") return "melee";
  if (bonus === "weapon_ranged") return "ranged";
  if (bonus === "spell_attack") return "spell";
  if (bonus === "monster") return null;
  // No attack bonus (kind: "save" or "auto") — derive from ref source.
  if (ref.source === "spell") return "spell";
  if (ref.source === "weapon") return "melee"; // default for non-attack weapon use
  return null;
}

function computeWeaponAbilityMod(
  char: CharacterData,
  ref: ActionRef,
  action: NonNullable<ReturnType<typeof getAction>>,
  options: DamageRollOptions,
  ctx: ResolveContext,
): { ability: Ability; value: number } | null {
  // Explicit DM override (used for weapons; spells get the mod via expression).
  if (options.ability) {
    const score = ctx.abilities[options.ability];
    return { ability: options.ability, value: abilityModFromScore(score) };
  }

  const bonus = action.attack?.bonus;
  if (ref.source === "weapon" || bonus === "weapon_melee" || bonus === "weapon_ranged") {
    const ability = chooseWeaponAbility(char, ref.name);
    if (!ability) return null;
    const score = ctx.abilities[ability];
    return { ability, value: abilityModFromScore(score) };
  }

  return null;
}

function resolveExtra(
  char: CharacterData,
  extra: DamageRollExtra,
  ctx: ResolveContext,
  defaultDamageType?: string,
): {
  dice?: string;
  flat?: number;
  damageType?: string;
  label: string;
  error?: string;
} {
  const label = extra.name;

  // Override path — DM passes raw dice for ad-hoc/homebrew extras.
  if (extra.diceOverride) {
    return {
      dice: extra.diceOverride,
      damageType: extra.typeOverride ?? defaultDamageType,
      label,
    };
  }

  const refForLookup: ActionRef = {
    source: extra.source === "feat" ? "feature" : extra.source,
    name: extra.name,
  };
  const resolved = resolveActionRef(refForLookup);
  if (!resolved.action) {
    return { label, error: `Extra "${extra.name}" not found in DB (${extra.source})` };
  }
  const action = getAction(
    { effects: { action: resolved.action } },
    {
      upcastLevel: extra.upcastLevel,
      characterLevel: ctx.totalLevel,
    },
  );
  if (!action) return { label, error: `Extra "${extra.name}" could not be contextualised` };
  const outcome =
    action.kind === "save" ? action.onFailedSave : (action.onHit ?? action.onFailedSave);
  const damageEntries = outcome?.damage ?? [];
  if (damageEntries.length === 0) {
    return { label, error: `Extra "${extra.name}" has no damage entries` };
  }

  const dicePieces: string[] = [];
  let flat = 0;
  let damageType: string | undefined = damageEntries[0].type;
  // Sneak Attack notes "damage type matches the weapon" — honour typeOverride.
  if (extra.typeOverride) damageType = extra.typeOverride;

  for (const entry of damageEntries) {
    const expanded = resolveDamageValue(entry.dice, ctx);
    if (expanded.dice.length > 0) dicePieces.push(...expanded.dice);
    flat += expanded.flat;
  }

  return {
    dice: dicePieces.length > 0 ? dicePieces.join("+") : undefined,
    flat: flat !== 0 ? flat : undefined,
    damageType,
    label,
  };
}

/**
 * Double the dice count in a notation fragment for crit doubling.
 *
 * Handles "+"-joined pieces:
 *   "1d8" → "2d8"
 *   "2d6" → "4d6"
 *   "1d6+1d4" → "2d6+2d4"
 */
function doubleDice(piece: string): string {
  return piece.replace(/(\d+)d(\d+)/g, (_m, count, sides) => `${parseInt(count, 10) * 2}d${sides}`);
}

/** Combine dice pieces and a flat number into a final notation string. */
function buildNotation(dicePieces: string[], flat: number): string {
  const parts: string[] = [];
  for (const piece of dicePieces) {
    if (piece) parts.push(piece);
  }
  if (flat !== 0) parts.push(flat > 0 ? `+${flat}` : `${flat}`);
  if (parts.length === 0) return "0";
  // Join dice pieces with '+' but keep flat sign; first part has no leading +.
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === 0) {
      result = p.startsWith("+") ? p.slice(1) : p;
      continue;
    }
    if (p.startsWith("+") || p.startsWith("-")) {
      result += p;
    } else {
      result += `+${p}`;
    }
  }
  return result;
}
