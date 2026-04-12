"use client";

import type { EntityCategory } from "@unseen-servant/shared/types";
import {
  getSpell,
  getCondition,
  getAction,
  getBaseItem,
  getMagicItem,
  getFeat,
  getDisease,
  getStatus,
} from "@unseen-servant/shared/data";
import { DetailPopover } from "./DetailPopover";
import { RichText } from "../ui/RichText";
import { useEntityPopover, useEntityClick } from "./EntityPopoverContext";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EntityDetailPopoverProps {
  id: string;
  category: EntityCategory;
  name: string;
  position: { x: number; y: number };
  level: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityDetailPopover({
  id,
  category,
  name,
  position,
  level,
}: EntityDetailPopoverProps) {
  const { pop, isTopmost } = useEntityPopover();
  const onEntityClick = useEntityClick();

  const content = resolveContent(category, name, onEntityClick);

  if (!content) return null;

  return (
    <DetailPopover
      title={content.title}
      onClose={pop}
      position={position}
      level={level + 1}
      popoverId={id}
      isTopmost={isTopmost(id)}
    >
      {content.body}
    </DetailPopover>
  );
}

// ---------------------------------------------------------------------------
// Entity resolution
// ---------------------------------------------------------------------------

interface ResolvedContent {
  title: string;
  body: React.ReactNode;
}

function resolveContent(
  category: EntityCategory,
  name: string,
  onEntityClick?: (
    category: EntityCategory,
    name: string,
    position: { x: number; y: number },
  ) => void,
): ResolvedContent | null {
  switch (category) {
    case "condition": {
      const data = getCondition(name);
      if (!data) return null;
      return {
        title: data.name,
        body: (
          <RichText
            text={data.description}
            className="text-gray-300 text-sm"
            onEntityClick={onEntityClick}
          />
        ),
      };
    }

    case "disease": {
      const data = getDisease(name);
      if (!data) return null;
      return {
        title: data.name,
        body: (
          <RichText
            text={data.description}
            className="text-gray-300 text-sm"
            onEntityClick={onEntityClick}
          />
        ),
      };
    }

    case "status": {
      const data = getStatus(name);
      if (!data) return null;
      return {
        title: data.name,
        body: (
          <RichText
            text={data.description}
            className="text-gray-300 text-sm"
            onEntityClick={onEntityClick}
          />
        ),
      };
    }

    case "spell": {
      const data = getSpell(name);
      if (!data) return null;
      const levelStr =
        data.level === 0 ? "Cantrip" : `Level ${data.level}${data.school ? ` ${data.school}` : ""}`;
      return {
        title: data.name,
        body: (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-amber-900/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-700/30">
                {levelStr}
              </span>
              {data.concentration && (
                <span className="text-xs bg-yellow-900/40 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-700/50">
                  Concentration
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {data.castingTime && (
                <div className="bg-gray-900/50 border border-gray-700 rounded px-2 py-1">
                  <div className="text-gray-500 uppercase text-[10px]">Cast</div>
                  <div className="text-gray-300">{data.castingTime}</div>
                </div>
              )}
              {data.range && (
                <div className="bg-gray-900/50 border border-gray-700 rounded px-2 py-1">
                  <div className="text-gray-500 uppercase text-[10px]">Range</div>
                  <div className="text-gray-300">{data.range}</div>
                </div>
              )}
            </div>
            <RichText
              text={data.description}
              className="text-gray-300 text-sm"
              onEntityClick={onEntityClick}
            />
          </div>
        ),
      };
    }

    case "action": {
      const data = getAction(name);
      if (!data) return null;
      return {
        title: data.name,
        body: (
          <div className="space-y-2">
            {data.time && (
              <span className="text-xs bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/30">
                {data.time}
              </span>
            )}
            <RichText
              text={data.description}
              className="text-gray-300 text-sm"
              onEntityClick={onEntityClick}
            />
          </div>
        ),
      };
    }

    case "item": {
      const data = getBaseItem(name) ?? getMagicItem(name);
      if (!data) return null;
      return {
        title: data.name,
        body: (
          <RichText
            text={data.description ?? "No description available."}
            className="text-gray-300 text-sm"
            onEntityClick={onEntityClick}
          />
        ),
      };
    }

    case "feat": {
      const data = getFeat(name);
      if (!data) return null;
      return {
        title: data.name,
        body: (
          <div className="space-y-2">
            {data.prerequisite && (
              <span className="text-xs text-gray-400 italic">
                Prerequisite: {data.prerequisite}
              </span>
            )}
            <RichText
              text={data.description}
              className="text-gray-300 text-sm"
              onEntityClick={onEntityClick}
            />
          </div>
        ),
      };
    }

    // rule, class, species, background — no nested popover data yet
    default:
      return null;
  }
}
