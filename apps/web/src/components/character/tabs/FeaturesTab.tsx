import { useState, useMemo } from "react";
import type { CharacterData, CharacterFeatureRef } from "@unseen-servant/shared/types";
import { resolveFeatureDescription } from "@unseen-servant/shared/data";
import { FilterChipBar } from "../FilterChipBar";

interface FeaturesTabProps {
  character: CharacterData;
  onFeatureClick: (feature: CharacterFeatureRef, e: React.MouseEvent) => void;
}

type FeatureFilter = "all" | "class" | "subclass" | "feat" | "species" | "background";

export function FeaturesTab({ character, onFeatureClick }: FeaturesTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const [traitsOpen, setTraitsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [backstoryOpen, setBackstoryOpen] = useState(false);
  const s = character.static;

  const counts = useMemo(() => {
    const cls = s.features.filter((f) => f.dbKind === "class" || f.dbKind === "subclass").length;
    const race = s.features.filter((f) => f.dbKind === "species").length;
    const feat = s.features.filter((f) => f.dbKind === "feat").length;
    const bg = s.features.filter((f) => f.dbKind === "background").length;
    return { cls, race, feat, bg };
  }, [s.features]);

  const chips = [
    { id: "all", label: "ALL", count: s.features.length },
    ...(counts.cls > 0 ? [{ id: "class", label: "CLASS", count: counts.cls }] : []),
    ...(counts.race > 0 ? [{ id: "species", label: "SPECIES", count: counts.race }] : []),
    ...(counts.feat > 0 ? [{ id: "feat", label: "FEATS", count: counts.feat }] : []),
    ...(counts.bg > 0 ? [{ id: "background", label: "BACKGROUND", count: counts.bg }] : []),
  ];

  const filtered = useMemo(() => {
    if (filter === "all") return s.features;
    if (filter === "class")
      return s.features.filter((f) => f.dbKind === "class" || f.dbKind === "subclass");
    return s.features.filter((f) => f.dbKind === (filter as FeatureFilter));
  }, [s.features, filter]);

  // Group by dbKind for "all" view
  const groups = useMemo(() => {
    if (filter !== "all") return [{ key: filter, label: "", features: filtered }];
    const sourceOrder: { key: string; label: string }[] = [
      { key: "class", label: "Class Features" },
      { key: "species", label: "Species Traits" },
      { key: "feat", label: "Feats" },
      { key: "background", label: "Background" },
    ];
    return sourceOrder
      .map((g) => ({
        ...g,
        features: filtered.filter((f) =>
          g.key === "class" ? f.dbKind === "class" || f.dbKind === "subclass" : f.dbKind === g.key,
        ),
      }))
      .filter((g) => g.features.length > 0);
  }, [filtered, filter]);

  const hasTraits =
    s.traits.personalityTraits || s.traits.ideals || s.traits.bonds || s.traits.flaws;

  return (
    <div className="space-y-2">
      <FilterChipBar chips={chips} activeChipId={filter} onSelect={setFilter} />

      {/* Features list */}
      {groups.map((group) => (
        <div key={group.key}>
          {group.label && (
            <div
              className="mb-0.5 px-1.5 text-sm font-medium tracking-wider text-gray-500 uppercase"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {group.label} ({group.features.length})
            </div>
          )}
          <div className="space-y-0.5">
            {group.features.map((feat, i) => {
              const displayName = feat.featureName ?? feat.dbName;
              const description = resolveFeatureDescription(feat);
              return (
                <div
                  key={`${feat.dbKind}-${feat.dbName}-${feat.featureName ?? ""}-${i}`}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                    description
                      ? "cursor-pointer text-gray-300 transition-colors hover:bg-gray-800/60 hover:text-amber-300"
                      : "text-gray-400"
                  }`}
                  onClick={description ? (e) => onFeatureClick(feat, e) : undefined}
                >
                  <span className="truncate">{displayName}</span>
                  {(feat.dbKind === "class" || feat.dbKind === "subclass") && feat.sourceLabel && (
                    <span className="shrink-0 text-xs text-amber-400/60">{feat.sourceLabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {s.features.length === 0 && (
        <div className="py-4 text-center text-xs text-gray-600">No features</div>
      )}

      {/* Divider — traits, appearance, alignment, backstory */}
      {(hasTraits || s.appearance || s.alignment || s.backstory) && (
        <div className="mt-2 space-y-1.5 border-t border-gray-700/40 pt-2">
          {/* Alignment (inline — one liner) */}
          {s.alignment && (
            <div className="flex items-baseline gap-2 px-1.5">
              <span className="text-xs text-gray-500">Alignment</span>
              <span className="text-xs text-gray-300">{s.alignment}</span>
            </div>
          )}
          {/* Traits */}
          {hasTraits && (
            <div>
              <button
                onClick={() => setTraitsOpen(!traitsOpen)}
                className="flex w-full items-center justify-between px-1.5 text-xs font-medium text-gray-400"
              >
                <span>Traits</span>
                <span className="text-gray-600">{traitsOpen ? "\u2212" : "+"}</span>
              </button>
              {traitsOpen && (
                <div className="mt-1 space-y-1 px-1.5">
                  {s.traits.personalityTraits && (
                    <div>
                      <div className="text-xs text-gray-500">Personality</div>
                      <div className="text-xs text-gray-300">{s.traits.personalityTraits}</div>
                    </div>
                  )}
                  {s.traits.ideals && (
                    <div>
                      <div className="text-xs text-gray-500">Ideals</div>
                      <div className="text-xs text-gray-300">{s.traits.ideals}</div>
                    </div>
                  )}
                  {s.traits.bonds && (
                    <div>
                      <div className="text-xs text-gray-500">Bonds</div>
                      <div className="text-xs text-gray-300">{s.traits.bonds}</div>
                    </div>
                  )}
                  {s.traits.flaws && (
                    <div>
                      <div className="text-xs text-gray-500">Flaws</div>
                      <div className="text-xs text-gray-300">{s.traits.flaws}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Backstory */}
          {s.backstory && (
            <div>
              <button
                onClick={() => setBackstoryOpen(!backstoryOpen)}
                className="flex w-full items-center justify-between px-1.5 text-xs font-medium text-gray-400"
              >
                <span>Backstory</span>
                <span className="text-gray-600">{backstoryOpen ? "\u2212" : "+"}</span>
              </button>
              {backstoryOpen && (
                <div className="mt-1 px-1.5">
                  <div className="text-xs break-words whitespace-pre-wrap text-gray-300">
                    {s.backstory}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Appearance */}
          {s.appearance && (
            <div>
              <button
                onClick={() => setAppearanceOpen(!appearanceOpen)}
                className="flex w-full items-center justify-between px-1.5 text-xs font-medium text-gray-400"
              >
                <span>Appearance</span>
                <span className="text-gray-600">{appearanceOpen ? "\u2212" : "+"}</span>
              </button>
              {appearanceOpen && (
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 px-1.5">
                  {s.appearance.gender && (
                    <div>
                      <span className="text-xs text-gray-500">Gender </span>
                      <span className="text-xs text-gray-300">{s.appearance.gender}</span>
                    </div>
                  )}
                  {s.appearance.age && (
                    <div>
                      <span className="text-xs text-gray-500">Age </span>
                      <span className="text-xs text-gray-300">{s.appearance.age}</span>
                    </div>
                  )}
                  {s.appearance.height && (
                    <div>
                      <span className="text-xs text-gray-500">Height </span>
                      <span className="text-xs text-gray-300">{s.appearance.height}</span>
                    </div>
                  )}
                  {s.appearance.weight && (
                    <div>
                      <span className="text-xs text-gray-500">Weight </span>
                      <span className="text-xs text-gray-300">{s.appearance.weight}</span>
                    </div>
                  )}
                  {s.appearance.hair && (
                    <div>
                      <span className="text-xs text-gray-500">Hair </span>
                      <span className="text-xs text-gray-300">{s.appearance.hair}</span>
                    </div>
                  )}
                  {s.appearance.eyes && (
                    <div>
                      <span className="text-xs text-gray-500">Eyes </span>
                      <span className="text-xs text-gray-300">{s.appearance.eyes}</span>
                    </div>
                  )}
                  {s.appearance.skin && (
                    <div>
                      <span className="text-xs text-gray-500">Skin </span>
                      <span className="text-xs text-gray-300">{s.appearance.skin}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
