import type { EntityEffects, Modifier, Property } from "../types/effects";

// ---------------------------------------------------------------------------
// Helpers — Modifier → string token
// ---------------------------------------------------------------------------

function formatValue(value: number | string): string {
  if (typeof value === "number") {
    return value >= 0 ? `+${value}` : String(value);
  }
  if (value === "prof") return "+Prof";
  if (value.includes("*") || value.includes("table")) return "+Scaled";
  const trimmed = value.length > 10 ? value.slice(0, 9) + "\u2026" : value;
  return `+${trimmed}`;
}

export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ABILITY_ABBR: Record<string, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

function modifierToken(mod: Modifier): string {
  const prefix = formatValue(mod.value);
  const t = mod.target;

  if (t in ABILITY_ABBR) return `${prefix} ${ABILITY_ABBR[t]}`;
  if (t === "ac") return `${prefix} AC`;
  if (t === "hp") {
    const isPerLevel =
      typeof mod.value === "string" && (mod.value.includes("lvl") || mod.value.includes("*"));
    return isPerLevel ? `${prefix} HP/lvl` : `${prefix} HP`;
  }
  if (t === "speed" || t.startsWith("speed_")) {
    const suffix = t === "speed" ? "Speed" : titleCase(t.replace("speed_", "") + " Speed");
    return `${prefix} ${suffix}`;
  }
  if (t === "initiative") return `${prefix} Initiative`;
  if (t.startsWith("attack")) {
    const suffix = t === "attack" ? "Attack" : titleCase(t.replace("attack_", "") + " Attack");
    return `${prefix} ${suffix}`;
  }
  if (t.startsWith("damage")) {
    const suffix = t === "damage" ? "Damage" : titleCase(t.replace("damage_", "") + " Damage");
    return `${prefix} ${suffix}`;
  }
  return `${prefix} ${titleCase(t.replace(/_/g, " "))}`;
}

// ---------------------------------------------------------------------------
// Helpers — Property → string token (null = skip)
// ---------------------------------------------------------------------------

function formatUsage(
  usage: "at_will" | "always_prepared" | `${number}/${"short" | "long"}_rest`,
): string {
  if (usage === "at_will") return "at will";
  if (usage === "always_prepared") return "prepared";
  return usage.replace("/long_rest", "/LR").replace("/short_rest", "/SR");
}

function propertyToken(prop: Property): string | null {
  switch (prop.type) {
    case "resistance":
      return `Resist ${titleCase(prop.damageType)}`;
    case "immunity":
      return `Immune ${titleCase(prop.damageType)}`;
    case "vulnerability":
      return `Vuln ${titleCase(prop.damageType)}`;
    case "condition_immunity":
      return `Immune: ${prop.conditionName}`;
    case "proficiency":
      return `Prof: ${titleCase(prop.value)}`;
    case "expertise":
      return `Expertise: ${prop.skill}`;
    case "sense":
      return `${titleCase(prop.sense)} ${prop.range}ft`;
    case "spell_grant":
      return `${titleCase(prop.spell)} (${formatUsage(prop.usage)})`;
    case "resource": {
      const restLabel =
        [prop.shortRest && "SR", prop.longRest && "LR"].filter(Boolean).join("/") || "LR";
      const maxLabel = typeof prop.maxUses === "number" ? String(prop.maxUses) : "Scaled";
      return `${prop.name} (${maxLabel}/${restLabel})`;
    }
    case "advantage":
      return `Adv: ${titleCase(prop.on.replace(/_/g, " "))}`;
    case "disadvantage":
      return `Disadv: ${titleCase(prop.on.replace(/_/g, " "))}`;
    case "extra_attack":
      return prop.count > 1 ? `Extra Attack \u00d7${prop.count}` : "Extra Attack";
    case "weapon_mastery_grant":
      return `Mastery: ${prop.weapon}`;
    case "score_cap":
      return `${titleCase(prop.ability)} Max ${prop.max}`;
    case "roll_minimum": {
      const target = titleCase(prop.on.replace(/_/g, " "));
      const prefix = prop.mode === "total" ? "Total" : "d20";
      const suffix = prop.proficientOnly ? " (if proficient)" : "";
      return `${target}: ${prefix} \u2265 ${prop.min}${suffix}`;
    }
    case "crit_rider": {
      const dmgType = titleCase(prop.weaponDamageType);
      let effectLabel: string;
      switch (prop.effect.kind) {
        case "extra_die":
          effectLabel = "extra die";
          break;
        case "advantage_next_attack":
          effectLabel = "next atk vs target has adv";
          break;
        case "target_disadvantage_attacks":
          effectLabel = "target disadv on attacks";
          break;
      }
      return `${dmgType} crit: ${effectLabel}`;
    }
    case "grant":
      return `Grants: ${prop.grant}`;
    case "damage_reduction": {
      const amtLabel =
        prop.amount === "half"
          ? "half"
          : typeof prop.amount === "number"
            ? String(prop.amount)
            : prop.amount;
      const typesLabel =
        !prop.damageTypes || prop.damageTypes.length === 0
          ? "all"
          : prop.damageTypes.map((t) => t.toUpperCase().slice(0, 3)).join("/");
      return `DR ${amtLabel} (${typesLabel})`;
    }
    case "save_outcome_override":
      return `Evasion (${titleCase(prop.ability)})`;
    case "bonus_action_grant":
      return `BA: ${prop.actions.join("/")}`;
    case "note":
      return prop.text;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Produces a comma-separated human-readable summary of an EntityEffects payload.
 * Returns an empty string when there are no modifiers or properties.
 */
export function summarizeEffects(effects: EntityEffects | undefined): string {
  if (!effects) return "";
  const tokens: string[] = [];

  if (effects.modifiers) {
    for (const mod of effects.modifiers) {
      tokens.push(modifierToken(mod));
    }
  }
  if (effects.properties) {
    for (const prop of effects.properties) {
      const token = propertyToken(prop);
      if (token) tokens.push(token);
    }
  }

  return tokens.join(", ");
}
