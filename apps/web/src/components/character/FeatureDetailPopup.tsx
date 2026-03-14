"use client";

import type { CharacterFeature } from "@unseen-servant/shared/types";
import { DetailPopover } from "./DetailPopover";
import { Prose } from "../Prose";

const SOURCE_COLORS: Record<
  CharacterFeature["source"],
  { bg: string; text: string }
> = {
  class: { bg: "bg-amber-900/20", text: "text-amber-300" },
  race: { bg: "bg-blue-900/40", text: "text-blue-300" },
  feat: { bg: "bg-amber-900/40", text: "text-amber-300" },
  background: { bg: "bg-emerald-900/40", text: "text-emerald-300" },
};

const SOURCE_LABELS: Record<CharacterFeature["source"], string> = {
  class: "Class",
  race: "Species",
  feat: "Feat",
  background: "Background",
};

interface FeatureDetailPopupProps {
  feature: CharacterFeature;
  onClose: () => void;
  position: { x: number; y: number };
}

export function FeatureDetailPopup({
  feature,
  onClose,
  position,
}: FeatureDetailPopupProps) {
  const colors = SOURCE_COLORS[feature.source];
  const sourceTag = feature.sourceLabel
    ? `${SOURCE_LABELS[feature.source]}: ${feature.sourceLabel}`
    : SOURCE_LABELS[feature.source];

  return (
    <DetailPopover title={feature.name} onClose={onClose} position={position}>
      <div className="space-y-2">
        {/* Source badge */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border border-current/20`}
          >
            {sourceTag}
          </span>
          {feature.requiredLevel != null && (
            <span className="text-xs text-gray-500">
              Level {feature.requiredLevel}
            </span>
          )}
        </div>

        {/* Description */}
        <Prose className="text-gray-300">
          {feature.description || "No description available."}
        </Prose>
      </div>
    </DetailPopover>
  );
}
