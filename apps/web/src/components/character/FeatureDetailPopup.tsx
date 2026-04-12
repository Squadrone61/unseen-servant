"use client";

import type { CharacterFeatureRef } from "@unseen-servant/shared/types";
import { resolveFeatureDescription } from "@unseen-servant/shared/data";
import { DetailPopover } from "./DetailPopover";
import { RichText } from "../ui/RichText";
import { useEntityClick } from "./EntityPopoverContext";

const SOURCE_COLORS: Record<CharacterFeatureRef["dbKind"], { bg: string; text: string }> = {
  class: { bg: "bg-amber-900/20", text: "text-amber-300" },
  subclass: { bg: "bg-amber-900/20", text: "text-amber-300" },
  species: { bg: "bg-blue-900/40", text: "text-blue-300" },
  feat: { bg: "bg-amber-900/40", text: "text-amber-300" },
  background: { bg: "bg-emerald-900/40", text: "text-emerald-300" },
};

const SOURCE_LABELS: Record<CharacterFeatureRef["dbKind"], string> = {
  class: "Class",
  subclass: "Subclass",
  species: "Species",
  feat: "Feat",
  background: "Background",
};

interface FeatureDetailPopupProps {
  feature: CharacterFeatureRef;
  onClose: () => void;
  position: { x: number; y: number };
}

export function FeatureDetailPopup({ feature, onClose, position }: FeatureDetailPopupProps) {
  const onEntityClick = useEntityClick();
  const colors = SOURCE_COLORS[feature.dbKind];
  const sourceTag = feature.sourceLabel
    ? `${SOURCE_LABELS[feature.dbKind]}: ${feature.sourceLabel}`
    : SOURCE_LABELS[feature.dbKind];
  const displayName = feature.featureName ?? feature.dbName;
  const description = resolveFeatureDescription(feature);

  return (
    <DetailPopover title={displayName} onClose={onClose} position={position}>
      <div className="space-y-2">
        {/* Source badge */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border border-current/20`}
          >
            {sourceTag}
          </span>
          {feature.requiredLevel != null && (
            <span className="text-xs text-gray-500">Level {feature.requiredLevel}</span>
          )}
        </div>

        {/* Description */}
        <RichText
          text={description || "No description available."}
          className="text-gray-300 text-sm"
          onEntityClick={onEntityClick}
        />
      </div>
    </DetailPopover>
  );
}
