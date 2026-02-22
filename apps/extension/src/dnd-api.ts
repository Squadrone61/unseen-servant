const API_BASE = "https://www.dnd5eapi.co/api/2014";

// In-memory cache (session-scoped, clears when service worker restarts)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 1800_000; // 30 minutes

export interface SpellData {
  index: string;
  name: string;
  level: number;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  damage?: {
    damage_type?: { name: string };
    damage_at_slot_level?: Record<string, string>;
  };
  dc?: {
    dc_type?: { name: string };
    dc_success?: string;
  };
  area_of_effect?: {
    type: string;
    size: number;
  };
  school?: { name: string };
  classes?: Array<{ name: string }>;
}

export interface MonsterData {
  index: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  armor_class: Array<{ type: string; value: number }>;
  hit_points: number;
  hit_dice: string;
  speed: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies: Array<{ value: number; proficiency: { name: string } }>;
  senses: Record<string, string | number>;
  languages: string;
  challenge_rating: number;
  xp: number;
  special_abilities?: Array<{ name: string; desc: string }>;
  actions?: Array<{
    name: string;
    desc: string;
    attack_bonus?: number;
    damage?: Array<{ damage_dice: string; damage_type: { name: string } }>;
  }>;
  legendary_actions?: Array<{ name: string; desc: string }>;
  reactions?: Array<{ name: string; desc: string }>;
}

export interface ConditionData {
  index: string;
  name: string;
  desc: string[];
}

export interface RuleData {
  index: string;
  name: string;
  desc: string;
}

export interface SpellSearchResult {
  index: string;
  name: string;
  level: number;
}

function normalizeIndex(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function cachedFetch<T>(url: string, cacheKey: string): Promise<T | null> {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T | null;
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
      cache.set(cacheKey, { data: null, timestamp: Date.now() });
      return null;
    }

    if (!response.ok) {
      console.error(`[dnd-api] HTTP ${response.status} from ${url}`);
      return null;
    }

    const data = (await response.json()) as T;
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`[dnd-api] Fetch error for ${url}:`, error);
    return null;
  }
}

export async function lookupSpell(name: string): Promise<SpellData | null> {
  const index = normalizeIndex(name);
  return cachedFetch<SpellData>(`${API_BASE}/spells/${index}`, `spell:${index}`);
}

export async function lookupMonster(name: string): Promise<MonsterData | null> {
  const index = normalizeIndex(name);
  return cachedFetch<MonsterData>(`${API_BASE}/monsters/${index}`, `monster:${index}`);
}

export async function lookupCondition(name: string): Promise<ConditionData | null> {
  const index = normalizeIndex(name);
  return cachedFetch<ConditionData>(`${API_BASE}/conditions/${index}`, `condition:${index}`);
}

export async function lookupRule(section: string): Promise<RuleData | null> {
  const index = normalizeIndex(section);
  return cachedFetch<RuleData>(`${API_BASE}/rule-sections/${index}`, `rule:${index}`);
}

export async function searchSpells(query: string): Promise<SpellSearchResult[]> {
  const normalized = query.toLowerCase().trim();
  const result = await cachedFetch<{ count: number; results: SpellSearchResult[] }>(
    `${API_BASE}/spells?name=${encodeURIComponent(normalized)}`,
    `search:spell:${normalized}`,
  );
  return result?.results ?? [];
}

export function formatSpellForAI(spell: SpellData): string {
  const lines: string[] = [];
  const school = spell.school?.name ?? "Unknown";
  const conc = spell.concentration ? ", Concentration" : "";
  const ritual = spell.ritual ? ", Ritual" : "";
  lines.push(`SPELL: ${spell.name} (Level ${spell.level}, ${school}${conc}${ritual})`);

  const components = spell.components.join(", ");
  const material = spell.material ? ` (${spell.material})` : "";
  lines.push(`Casting Time: ${spell.casting_time} | Range: ${spell.range} | Components: ${components}${material}`);
  lines.push(`Duration: ${spell.duration}`);

  if (spell.desc.length > 0) lines.push(spell.desc[0]);

  if (spell.damage) {
    const dmgType = spell.damage.damage_type?.name ?? "untyped";
    const slotLevels = spell.damage.damage_at_slot_level;
    if (slotLevels) {
      const baseLevel = String(spell.level);
      const baseDice = slotLevels[baseLevel] ?? Object.values(slotLevels)[0];
      if (baseDice) lines.push(`Damage: ${baseDice} ${dmgType}`);
    }
  }

  if (spell.dc) {
    const saveType = spell.dc.dc_type?.name ?? "Unknown";
    const onSuccess = spell.dc.dc_success ?? "none";
    lines.push(`Save: ${saveType}, on success: ${onSuccess}`);
  }

  if (spell.area_of_effect) {
    lines.push(`Area: ${spell.area_of_effect.size}-ft ${spell.area_of_effect.type}`);
  }

  if (spell.higher_level && spell.higher_level.length > 0) {
    lines.push(`At Higher Levels: ${spell.higher_level[0]}`);
  }

  if (spell.classes && spell.classes.length > 0) {
    lines.push(`Classes: ${spell.classes.map((c) => c.name).join(", ")}`);
  }

  return lines.join("\n");
}

export function formatMonsterForAI(monster: MonsterData): string {
  const lines: string[] = [];
  const ac = monster.armor_class?.[0]?.value ?? "?";
  lines.push(`MONSTER: ${monster.name} (${monster.size} ${monster.type}, ${monster.alignment})`);
  lines.push(`AC: ${ac} | HP: ${monster.hit_points} (${monster.hit_dice}) | Speed: ${formatSpeed(monster.speed)}`);
  lines.push(`CR: ${monster.challenge_rating} (${monster.xp} XP)`);

  const mod = (s: number) => { const m = Math.floor((s - 10) / 2); return m >= 0 ? `+${m}` : `${m}`; };
  lines.push(
    `STR ${monster.strength} (${mod(monster.strength)}) | DEX ${monster.dexterity} (${mod(monster.dexterity)}) | CON ${monster.constitution} (${mod(monster.constitution)}) | INT ${monster.intelligence} (${mod(monster.intelligence)}) | WIS ${monster.wisdom} (${mod(monster.wisdom)}) | CHA ${monster.charisma} (${mod(monster.charisma)})`,
  );

  if (monster.proficiencies.length > 0) {
    const profs = monster.proficiencies.map(
      (p) => `${p.proficiency.name.replace("Skill: ", "").replace("Saving Throw: ", "Save:")} +${p.value}`,
    );
    lines.push(`Proficiencies: ${profs.join(", ")}`);
  }

  const senses = Object.entries(monster.senses)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ");
  if (senses) lines.push(`Senses: ${senses}`);
  if (monster.languages) lines.push(`Languages: ${monster.languages}`);

  if (monster.special_abilities?.length) {
    lines.push("--- Special Abilities ---");
    for (const a of monster.special_abilities) lines.push(`${a.name}: ${a.desc}`);
  }
  if (monster.actions?.length) {
    lines.push("--- Actions ---");
    for (const a of monster.actions) lines.push(`${a.name}: ${a.desc}`);
  }
  if (monster.legendary_actions?.length) {
    lines.push("--- Legendary Actions ---");
    for (const a of monster.legendary_actions) lines.push(`${a.name}: ${a.desc}`);
  }
  if (monster.reactions?.length) {
    lines.push("--- Reactions ---");
    for (const a of monster.reactions) lines.push(`${a.name}: ${a.desc}`);
  }

  return lines.join("\n");
}

export function formatConditionForAI(condition: ConditionData): string {
  return `CONDITION: ${condition.name}\n${condition.desc.join("\n")}`;
}

export function formatRuleForAI(rule: RuleData): string {
  const desc = rule.desc.length > 2000 ? rule.desc.slice(0, 2000) + "..." : rule.desc;
  return `RULE: ${rule.name}\n${desc}`;
}

function formatSpeed(speed: Record<string, string>): string {
  return Object.entries(speed)
    .map(([type, val]) => (type === "walk" ? val : `${type} ${val}`))
    .join(", ");
}
