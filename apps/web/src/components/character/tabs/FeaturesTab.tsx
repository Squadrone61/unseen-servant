import { useState, useMemo } from "react";
import type { CharacterData, CharacterFeature } from "@unseen-servant/shared/types";
import { FilterChipBar } from "../FilterChipBar";

interface FeaturesTabProps {
  character: CharacterData;
  onFeatureClick: (feature: CharacterFeature, e: React.MouseEvent) => void;
}

type FeatureFilter = "all" | "class" | "race" | "feat" | "background";

export function FeaturesTab({ character, onFeatureClick }: FeaturesTabProps) {
  const [filter, setFilter] = useState<string>("all");
  const [traitsOpen, setTraitsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const s = character.static;

  const counts = useMemo(() => {
    const cls = s.features.filter((f) => f.source === "class").length;
    const race = s.features.filter((f) => f.source === "race").length;
    const feat = s.features.filter((f) => f.source === "feat").length;
    const bg = s.features.filter((f) => f.source === "background").length;
    return { cls, race, feat, bg };
  }, [s.features]);

  const chips = [
    { id: "all", label: "ALL", count: s.features.length },
    ...(counts.cls > 0 ? [{ id: "class", label: "CLASS", count: counts.cls }] : []),
    ...(counts.race > 0 ? [{ id: "race", label: "SPECIES", count: counts.race }] : []),
    ...(counts.feat > 0 ? [{ id: "feat", label: "FEATS", count: counts.feat }] : []),
    ...(counts.bg > 0 ? [{ id: "background", label: "BACKGROUND", count: counts.bg }] : []),
  ];

  const filtered = useMemo(() => {
    if (filter === "all") return s.features;
    return s.features.filter((f) => f.source === (filter as FeatureFilter));
  }, [s.features, filter]);

  // Group by source for "all" view
  const groups = useMemo(() => {
    if (filter !== "all") return [{ key: filter, label: "", features: filtered }];
    const sourceOrder: { key: string; label: string }[] = [
      { key: "class", label: "Class Features" },
      { key: "race", label: "Species Traits" },
      { key: "feat", label: "Feats" },
      { key: "background", label: "Background" },
    ];
    return sourceOrder
      .map((g) => ({
        ...g,
        features: filtered.filter((f) => f.source === g.key),
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
              className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-0.5 px-1.5"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {group.label} ({group.features.length})
            </div>
          )}
          <div className="space-y-0.5">
            {group.features.map((feat) => (
              <div
                key={feat.name}
                className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  feat.description
                    ? "text-gray-300 cursor-pointer hover:text-amber-300 hover:bg-gray-800/60 transition-colors"
                    : "text-gray-400"
                }`}
                onClick={feat.description ? (e) => onFeatureClick(feat, e) : undefined}
              >
                <span className="truncate">{feat.name}</span>
                {feat.source === "class" && feat.sourceLabel && (
                  <span className="text-xs text-amber-400/60 shrink-0">{feat.sourceLabel}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {s.features.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4">No features</div>
      )}

      {/* Divider — traits & appearance */}
      {(hasTraits || s.appearance) && (
        <div className="border-t border-gray-700/40 pt-2 mt-2 space-y-1.5">
          {/* Traits */}
          {hasTraits && (
            <div>
              <button
                onClick={() => setTraitsOpen(!traitsOpen)}
                className="flex items-center justify-between w-full text-xs text-gray-400 font-medium px-1.5"
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

          {/* Appearance */}
          {s.appearance && (
            <div>
              <button
                onClick={() => setAppearanceOpen(!appearanceOpen)}
                className="flex items-center justify-between w-full text-xs text-gray-400 font-medium px-1.5"
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
