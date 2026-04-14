"use client";

import type { Spell } from "@unseen-servant/shared/types";
import { DetailPopover } from "./DetailPopover";
import { RichText } from "../ui/RichText";
import { useEntityClick } from "./EntityPopoverContext";
import { getSpell } from "@unseen-servant/shared/data";
import { damageTypeColor } from "@unseen-servant/shared/utils";
import type { StartPlacementParams } from "@/hooks/useAoEPlacement";

interface SpellDetailPopupProps {
  spell: Spell;
  onClose: () => void;
  position: { x: number; y: number };
  /** If provided, shows "Place on map" CTA for AoE spells */
  onCastAoE?: (params: StartPlacementParams) => void;
}

export function SpellDetailPopup({ spell, onClose, position, onCastAoE }: SpellDetailPopupProps) {
  const onEntityClick = useEntityClick();

  // Look up DB spell to get AoE info
  const dbSpell = getSpell(spell.name);
  const action = dbSpell?.effects?.action;
  const area = action?.area;

  // Map DB area shape to PendingAoEPayload shape
  function mapShape(dbShape: string): "sphere" | "cone" | "rectangle" {
    if (dbShape === "cone") return "cone";
    if (dbShape === "sphere" || dbShape === "cylinder") return "sphere";
    // line, cube → rectangle
    return "rectangle";
  }

  function mapRectPreset(dbShape: string): "free" | "line" | "cube" | undefined {
    if (dbShape === "line") return "line";
    if (dbShape === "cube") return "cube";
    return undefined;
  }

  const handlePlaceOnMap = () => {
    if (!area || !onCastAoE) return;
    // Determine color from primary damage type
    const primaryDamage =
      action?.onFailedSave?.damage?.[0]?.type ?? action?.onHit?.damage?.[0]?.type;
    const color = damageTypeColor(primaryDamage);
    const shape = mapShape(area.shape);
    const rectanglePreset = mapRectPreset(area.shape);
    const save = action?.save ? { ability: action.save.ability, dc: action.save.dc } : undefined;

    onCastAoE({
      shape,
      size: area.size,
      spellName: spell.name,
      label: spell.name,
      color,
      concentration: spell.concentration,
      rectanglePreset,
      save,
    });
    onClose();
  };
  const levelStr =
    spell.level === 0 ? "Cantrip" : `Level ${spell.level}${spell.school ? ` ${spell.school}` : ""}`;

  return (
    <DetailPopover title={spell.name} onClose={onClose} position={position}>
      <div className="space-y-3">
        {/* Level & School */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-amber-900/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-700/30">
            {levelStr}
          </span>
          {spell.school && spell.level === 0 && (
            <span className="text-xs text-gray-400">{spell.school}</span>
          )}
          {spell.ritual && (
            <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/50">
              Ritual
            </span>
          )}
          {spell.concentration && (
            <span className="text-xs bg-yellow-900/40 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-700/50">
              Concentration
            </span>
          )}
        </div>

        {/* Stat Grid */}
        <div className="grid grid-cols-2 gap-2">
          {spell.castingTime && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">Casting Time</div>
              <div className="text-sm text-gray-300">{spell.castingTime}</div>
            </div>
          )}
          {spell.range && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">Range</div>
              <div className="text-sm text-gray-300">{spell.range}</div>
            </div>
          )}
          {spell.components && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">Components</div>
              <div className="text-sm text-gray-300">{spell.components}</div>
            </div>
          )}
          {spell.duration && (
            <div className="bg-gray-900/50 border border-gray-700 rounded px-2.5 py-1.5">
              <div className="text-xs text-gray-500 uppercase">Duration</div>
              <div className="text-sm text-gray-300">{spell.duration}</div>
            </div>
          )}
        </div>

        {/* Description */}
        {spell.description && (
          <div>
            <div
              className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-1"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              Description
            </div>
            <RichText
              text={spell.description}
              className="text-gray-300 text-sm"
              onEntityClick={onEntityClick}
            />
          </div>
        )}

        {/* Place on map CTA — only for AoE spells when handler is provided */}
        {area && onCastAoE && (
          <button
            onClick={handlePlaceOnMap}
            className="w-full mt-1 bg-amber-600/80 hover:bg-amber-500/80 text-amber-100 text-sm font-medium rounded-lg py-2 transition-colors flex items-center justify-center gap-2"
          >
            <span>Place on Map</span>
            <span className="text-xs text-amber-300/70">
              {area.size}ft {area.shape}
            </span>
          </button>
        )}
      </div>
    </DetailPopover>
  );
}
