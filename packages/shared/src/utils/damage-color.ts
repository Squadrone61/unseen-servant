import type { DamageType } from "../types/effects.js";

const DAMAGE_COLORS: Record<DamageType, string> = {
  fire: "#FF6B35",
  cold: "#4FC3F7",
  lightning: "#FFF176",
  thunder: "#90CAF9",
  acid: "#81C784",
  poison: "#388E3C",
  necrotic: "#9C27B0",
  radiant: "#FFD54F",
  force: "#CE93D8",
  psychic: "#F48FB1",
  bludgeoning: "#BDBDBD",
  piercing: "#BDBDBD",
  slashing: "#BDBDBD",
};

const NEUTRAL = "#BDBDBD";

export function damageTypeColor(type: DamageType | undefined | null): string {
  if (!type) return NEUTRAL;
  return DAMAGE_COLORS[type] ?? NEUTRAL;
}
