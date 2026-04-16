"use client";

import { useMemo } from "react";
import type { EntityCategory } from "@unseen-servant/shared/types";
import type { EntityDetailData } from "@unseen-servant/shared/detail";
import {
  entityDetailFromSpell,
  entityDetailFromCondition,
  entityDetailFromFeat,
  entityDetailFromBaseItem,
  entityDetailFromMagicItem,
  entityDetailFromAction,
  entityDetailFromDisease,
  entityDetailFromStatus,
  entityDetailFromAbilityScore,
  entityDetailFromClassFeature,
  entityDetailFromInventoryItem,
  entityDetailFromChoiceOption,
} from "@unseen-servant/shared/detail";
import type {
  AbilityScoreDetailPayload,
  ClassFeatureDetailPayload,
  InventoryItemDetailPayload,
  ChoiceOptionDetailPayload,
} from "@unseen-servant/shared/detail";
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
import { damageTypeColor } from "@unseen-servant/shared/utils";
import { DetailPopover } from "./DetailPopover";
import { EntityDetail } from "./EntityDetail";
import { useEntityPopover, type PopoverEntry } from "./EntityPopoverContext";
import type { StartPlacementParams } from "@/hooks/useAoEPlacement";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EntityDetailPopoverProps {
  entry: PopoverEntry;
}

// ---------------------------------------------------------------------------
// Routing: resolve EntityDetailData from category + name + optional payload
// ---------------------------------------------------------------------------

function resolveEntityDetailData(
  category: EntityCategory,
  name: string,
  payload: PopoverEntry["payload"],
): EntityDetailData | null {
  switch (category) {
    case "spell": {
      const data = getSpell(name);
      if (!data) return null;
      return entityDetailFromSpell(data);
    }
    case "condition": {
      const data = getCondition(name);
      if (!data) return null;
      return entityDetailFromCondition(data);
    }
    case "feat": {
      const data = getFeat(name);
      if (!data) return null;
      return entityDetailFromFeat(data);
    }
    case "item": {
      const base = getBaseItem(name);
      if (base) return entityDetailFromBaseItem(base);
      const magic = getMagicItem(name);
      if (magic) return entityDetailFromMagicItem(magic);
      return null;
    }
    case "action": {
      const data = getAction(name);
      if (!data) return null;
      return entityDetailFromAction(data);
    }
    case "disease": {
      const data = getDisease(name);
      if (!data) return null;
      return entityDetailFromDisease(data);
    }
    case "status": {
      const data = getStatus(name);
      if (!data) return null;
      return entityDetailFromStatus(data);
    }
    case "ability-score": {
      const p = payload as AbilityScoreDetailPayload | undefined;
      if (!p) return null;
      return entityDetailFromAbilityScore(p.character, p.ability);
    }
    case "class-feature": {
      const p = payload as ClassFeatureDetailPayload | undefined;
      if (!p) return null;
      return entityDetailFromClassFeature(p.character, p.featureId);
    }
    case "inventory-item": {
      const p = payload as InventoryItemDetailPayload | undefined;
      if (!p) return null;
      return entityDetailFromInventoryItem(p.character, p.inventoryId);
    }
    case "choice-option": {
      const p = payload as ChoiceOptionDetailPayload | undefined;
      if (!p) return { title: name };
      return entityDetailFromChoiceOption(p);
    }
    // No popover data for these categories yet
    case "rule":
    case "class":
    case "species":
    case "background":
      return null;
  }
}

// ---------------------------------------------------------------------------
// "Place on Map" action handler — constructed from DB spell data
// ---------------------------------------------------------------------------

function mapAoEShape(dbShape: string): "sphere" | "cone" | "rectangle" {
  if (dbShape === "cone") return "cone";
  if (dbShape === "sphere" || dbShape === "cylinder") return "sphere";
  return "rectangle";
}

function mapRectPreset(dbShape: string): "free" | "line" | "cube" | undefined {
  if (dbShape === "line") return "line";
  if (dbShape === "cube") return "cube";
  return undefined;
}

function buildPlaceOnMapParams(spellName: string): StartPlacementParams | null {
  const dbSpell = getSpell(spellName);
  const area = dbSpell?.effects?.action?.area;
  if (!area) return null;

  const action = dbSpell?.effects?.action;
  const primaryDamage = action?.onFailedSave?.damage?.[0]?.type ?? action?.onHit?.damage?.[0]?.type;
  const color = damageTypeColor(primaryDamage);

  return {
    shape: mapAoEShape(area.shape),
    size: area.size,
    spellName,
    label: spellName,
    color,
    concentration: dbSpell?.concentration ?? false,
    rectanglePreset: mapRectPreset(area.shape),
    save: action?.save ? { ability: action.save.ability, dc: action.save.dc } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityDetailPopover({ entry }: EntityDetailPopoverProps) {
  const { pop, isTopmost } = useEntityPopover();

  const data = useMemo(
    () => resolveEntityDetailData(entry.category, entry.name, entry.payload),
    [entry.category, entry.name, entry.payload],
  );
  if (!data) return null;

  const topmost = isTopmost(entry.id);

  function handleActionTriggered(label: string) {
    if (label === "Place on Map") {
      const onCastAoE = entry.actionHandlers?.onCastAoE;
      if (!onCastAoE) return;
      const params = buildPlaceOnMapParams(entry.name);
      if (params) {
        onCastAoE(params);
        pop();
      }
    }
  }

  return (
    <DetailPopover
      title={data.title}
      onClose={pop}
      position={entry.position}
      level={entry.level + 1}
      popoverId={entry.id}
      isTopmost={topmost}
    >
      <EntityDetail data={data} onActionTriggered={handleActionTriggered} />
    </DetailPopover>
  );
}
