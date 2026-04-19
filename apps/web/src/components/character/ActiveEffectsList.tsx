"use client";

import type { EffectBundle, EntityCategory } from "@unseen-servant/shared/types";
import { useEntityPopover } from "./EntityPopoverContext";

interface ActiveEffectsListProps {
  effects: EffectBundle[] | undefined;
  compact?: boolean;
}

function lifetimeLabel(bundle: EffectBundle): string | undefined {
  const l = bundle.lifetime;
  switch (l.type) {
    case "concentration":
      return bundle.sourceConcentration
        ? `Concentration (${bundle.sourceConcentration.caster})`
        : "Concentration";
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

export function ActiveEffectsList({ effects, compact = false }: ActiveEffectsListProps) {
  const { push } = useEntityPopover();
  const visible = (effects ?? []).filter((b) => !isHidden(b));
  if (visible.length === 0) return null;

  if (compact) {
    return (
      <div className="mt-0.5 flex items-center gap-0.5">
        {visible.map((bundle, i) => {
          const category = popoverCategory(bundle);
          const label = bundle.source.name;
          const sub = lifetimeLabel(bundle);
          const title = sub ? `${label} \u2022 ${sub}` : label;
          const debuff = isDebuff(bundle);
          const dotClass = debuff ? "bg-red-400" : "bg-emerald-400";
          return (
            <span
              key={bundle.id || i}
              role={category ? "button" : undefined}
              tabIndex={category ? 0 : undefined}
              title={title}
              onClick={
                category
                  ? (e) => {
                      e.stopPropagation();
                      push(category, popoverName(bundle), { x: e.clientX, y: e.clientY });
                    }
                  : undefined
              }
              className={category ? "cursor-pointer" : undefined}
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
        {visible.map((bundle, i) => {
          const category = popoverCategory(bundle);
          const sub = lifetimeLabel(bundle);
          const debuff = isDebuff(bundle);
          const chipClass = debuff
            ? "border-red-800/50 bg-red-900/30 text-red-300 hover:bg-red-900/50"
            : "border-emerald-800/50 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50";
          const content = (
            <>
              <span>{bundle.source.name}</span>
              {sub && <span className="ml-1 text-xs text-gray-400">{sub}</span>}
            </>
          );
          return category ? (
            <button
              key={bundle.id || i}
              type="button"
              onClick={(e) => push(category, popoverName(bundle), { x: e.clientX, y: e.clientY })}
              className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs ${chipClass}`}
            >
              {content}
            </button>
          ) : (
            <span
              key={bundle.id || i}
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
