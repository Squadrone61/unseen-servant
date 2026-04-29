"use client";

import type { EffectBundle, EntityCategory, ConditionEntry } from "@unseen-servant/shared/types";
import { getCondition } from "@unseen-servant/shared/data";
import { useEntityPopover } from "./EntityPopoverContext";

interface ActiveEffectsListProps {
  effects: EffectBundle[] | undefined;
  conditions?: ConditionEntry[];
  compact?: boolean;
}

type VisualCategory =
  | "concentration"
  | "class-feature"
  | "item"
  | "spell"
  | "environmental"
  | "condition"
  | "other";

type Polarity = "positive" | "concentration" | "negative";

// Sort order: concentration first, then class features, items, spells, environmental, conditions, other.
const CATEGORY_ORDER: Record<VisualCategory, number> = {
  concentration: 0,
  "class-feature": 1,
  item: 2,
  spell: 3,
  environmental: 4,
  condition: 5,
  other: 6,
};

const CATEGORY_PREFIX: Record<VisualCategory, string> = {
  concentration: "CONC",
  "class-feature": "FEAT",
  item: "ITEM",
  spell: "SPELL",
  environmental: "ENV",
  condition: "COND",
  other: "",
};

const CHIP_CLASS_BY_POLARITY: Record<Polarity, string> = {
  positive: "border-emerald-800/50 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50",
  concentration: "border-purple-800/50 bg-purple-900/30 text-purple-300 hover:bg-purple-900/50",
  negative: "border-red-800/50 bg-red-900/30 text-red-300 hover:bg-red-900/50",
};

const PREFIX_CLASS_BY_POLARITY: Record<Polarity, string> = {
  positive: "text-emerald-400/80",
  concentration: "text-purple-400/80",
  negative: "text-red-400/80",
};

const DOT_CLASS_BY_POLARITY: Record<Polarity, string> = {
  positive: "bg-emerald-400",
  concentration: "bg-purple-400",
  negative: "bg-red-400",
};

function lifetimeLabel(bundle: EffectBundle): string | undefined {
  const l = bundle.lifetime;
  switch (l.type) {
    case "concentration":
      return bundle.sourceTracked?.identifier.kind === "spell"
        ? `from ${bundle.sourceTracked.caster}`
        : undefined;
    case "duration":
      return `${l.rounds} round${l.rounds === 1 ? "" : "s"}`;
    case "until_rest":
      return l.rest === "short" ? "Until rest" : "Until long rest";
    case "manual":
      return undefined;
    case "permanent":
      return undefined;
  }
}

function isHidden(bundle: EffectBundle): boolean {
  if (bundle.lifetime.type === "permanent") return true;
  if (bundle.source.type === "condition") return true;
  if (bundle.id.startsWith("condition:")) return true;
  return false;
}

function isDebuff(bundle: EffectBundle): boolean {
  const mods = bundle.effects.modifiers ?? [];
  for (const m of mods) {
    if (typeof m.value === "number" && m.value < 0) return true;
  }
  const props = bundle.effects.properties ?? [];
  for (const p of props) {
    if (p.type === "vulnerability") return true;
  }
  return false;
}

function effectVisualCategory(bundle: EffectBundle): VisualCategory {
  if (bundle.lifetime.type === "concentration") return "concentration";
  switch (bundle.source.type) {
    case "class":
    case "subclass":
    case "ability":
      return "class-feature";
    case "item":
      return "item";
    case "spell":
      return "spell";
    case "environment":
      return "environmental";
    default:
      return "other";
  }
}

function polarityForBundle(bundle: EffectBundle, category: VisualCategory): Polarity {
  if (category === "concentration") return "concentration";
  return isDebuff(bundle) ? "negative" : "positive";
}

function popoverCategory(bundle: EffectBundle): EntityCategory | undefined {
  switch (bundle.source.type) {
    case "spell":
      return "spell";
    case "item":
      return "item";
    case "feat":
      return "feat";
    case "class":
      return "class-feature";
    case "species":
      return "species";
    case "background":
      return "background";
    default:
      return undefined;
  }
}

function popoverName(bundle: EffectBundle): string {
  return bundle.source.featureName ?? bundle.source.name;
}

interface ChipEntry {
  key: string;
  category: VisualCategory;
  polarity: Polarity;
  prefix: string;
  name: string;
  sub: string | undefined;
  title: string;
  popover?: { category: EntityCategory; name: string };
}

function buildEffectEntry(bundle: EffectBundle, idx: number): ChipEntry {
  const category = effectVisualCategory(bundle);
  const polarity = polarityForBundle(bundle, category);
  const sub = lifetimeLabel(bundle);
  const name = bundle.source.name;
  const prefix = CATEGORY_PREFIX[category];
  const popoverCat = popoverCategory(bundle);
  return {
    key: bundle.id || `effect-${idx}`,
    category,
    polarity,
    prefix,
    name,
    sub,
    title: sub
      ? `${prefix ? `${prefix} ` : ""}${name} • ${sub}`
      : `${prefix ? `${prefix} ` : ""}${name}`,
    popover: popoverCat ? { category: popoverCat, name: popoverName(bundle) } : undefined,
  };
}

function buildConditionEntry(cond: ConditionEntry, idx: number): ChipEntry {
  const hasEntry = getCondition(cond.name) !== undefined;
  const sub = cond.duration ? `${cond.duration} round${cond.duration === 1 ? "" : "s"}` : undefined;
  const prefix = CATEGORY_PREFIX.condition;
  return {
    key: `cond-${cond.name}-${idx}`,
    category: "condition",
    polarity: "negative",
    prefix,
    name: cond.name,
    sub,
    title: sub ? `${prefix} ${cond.name} • ${sub}` : `${prefix} ${cond.name}`,
    popover: hasEntry ? { category: "condition", name: cond.name } : undefined,
  };
}

export function ActiveEffectsList({
  effects,
  conditions,
  compact = false,
}: ActiveEffectsListProps) {
  const { push } = useEntityPopover();

  const effectEntries = (effects ?? []).filter((b) => !isHidden(b)).map(buildEffectEntry);
  const conditionEntries = (conditions ?? []).map(buildConditionEntry);
  const entries = [...effectEntries, ...conditionEntries].sort(
    (a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category],
  );

  if (entries.length === 0) return null;

  if (compact) {
    return (
      <div className="mt-0.5 flex items-center gap-0.5">
        {entries.map((entry) => {
          const dotClass = DOT_CLASS_BY_POLARITY[entry.polarity];
          const pop = entry.popover;
          return (
            <span
              key={entry.key}
              role={pop ? "button" : undefined}
              tabIndex={pop ? 0 : undefined}
              title={entry.title}
              onClick={
                pop
                  ? (e) => {
                      e.stopPropagation();
                      push(pop.category, pop.name, { x: e.clientX, y: e.clientY });
                    }
                  : undefined
              }
              className={pop ? "cursor-pointer" : undefined}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div
        className="mb-1 text-sm font-medium tracking-wider text-gray-500 uppercase"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        Active Effects
      </div>
      <div className="flex flex-wrap gap-1">
        {entries.map((entry) => {
          const chipClass = CHIP_CLASS_BY_POLARITY[entry.polarity];
          const prefixClass = PREFIX_CLASS_BY_POLARITY[entry.polarity];
          const content = (
            <>
              {entry.prefix && (
                <span className={`mr-1 font-mono text-xs font-bold tracking-wide ${prefixClass}`}>
                  {entry.prefix}
                </span>
              )}
              <span>{entry.name}</span>
              {entry.sub && <span className="ml-1 text-xs text-gray-400">{entry.sub}</span>}
            </>
          );
          const pop = entry.popover;
          return pop ? (
            <button
              key={entry.key}
              type="button"
              onClick={(e) => push(pop.category, pop.name, { x: e.clientX, y: e.clientY })}
              className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs ${chipClass}`}
            >
              {content}
            </button>
          ) : (
            <span
              key={entry.key}
              className={`rounded-full border px-2 py-0.5 text-xs ${chipClass}`}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
