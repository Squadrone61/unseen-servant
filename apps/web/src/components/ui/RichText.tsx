"use client";

import { Fragment, type ReactNode } from "react";
import type {
  Entry,
  EntryEntries,
  EntrySection,
  EntryInset,
  EntryInsetReadaloud,
  EntryQuote,
  EntryList,
  EntryItem,
  EntryListItem,
  EntryTable,
  EntryTableGroup,
  EntryDice,
  EntryBonus,
  EntryBonusSpeed,
  EntryAbilityDc,
  EntryAbilityAttackMod,
  EntryAbilityGeneric,
  EntrySpellcasting,
  EntryHr,
  EntryLink,
  EntryCell,
  EntryOptions,
  EntryInline,
  EntryInlineBlock,
  EntryImage,
  EntryFlowchart,
  EntryFlowBlock,
  EntryOptionalFeature,
  EntryClassFeature,
  EntrySubclassFeature,
} from "@aidnd/shared/data";
import { parseTags, type ParsedTag } from "@aidnd/shared";

// ─── Tag type → style mapping ────────────────────────────

const TAG_STYLES: Record<string, string> = {
  spell: "text-amber-400 hover:text-amber-300 cursor-pointer underline decoration-amber-500/30 hover:decoration-amber-400/60",
  condition: "text-red-400 hover:text-red-300 cursor-pointer underline decoration-red-500/30 hover:decoration-red-400/60",
  disease: "text-red-400 hover:text-red-300 cursor-pointer underline decoration-red-500/30 hover:decoration-red-400/60",
  status: "text-orange-400 hover:text-orange-300 cursor-pointer underline decoration-orange-500/30",
  item: "text-emerald-400 hover:text-emerald-300 cursor-pointer underline decoration-emerald-500/30 hover:decoration-emerald-400/60",
  creature: "text-violet-400 hover:text-violet-300 cursor-pointer underline decoration-violet-500/30",
  action: "text-sky-400 hover:text-sky-300 cursor-pointer underline decoration-sky-500/30",
  skill: "text-blue-300",
  dice: "text-amber-300 font-mono",
  damage: "text-amber-300 font-mono",
  dc: "text-amber-300 font-semibold",
  hit: "text-amber-300 font-mono",
  chance: "text-amber-300 font-mono",
  recharge: "text-gray-400 text-xs",
  note: "text-gray-500 italic",
  b: "font-semibold text-gray-200",
  i: "italic",
  bold: "font-semibold text-gray-200",
  italic: "italic",
  sense: "text-blue-300",
  scaledice: "text-amber-300 font-mono",
  scaledamage: "text-amber-300 font-mono",
  atk: "text-amber-300",
  feat: "text-amber-400 hover:text-amber-300 cursor-pointer underline decoration-amber-500/30",
  optfeature: "text-cyan-400 hover:text-cyan-300 cursor-pointer underline decoration-cyan-500/30",
  class: "text-amber-300",
  subclass: "text-amber-300",
  race: "text-amber-300",
  background: "text-amber-300",
  book: "text-gray-500 italic",
  filter: "text-gray-400",
  area: "text-gray-300",
  table: "text-gray-400",
  quickref: "text-gray-400",
};

// Tags that are clickable and should trigger onTagClick
const CLICKABLE_TAGS = new Set([
  "spell", "condition", "disease", "item", "creature", "action",
  "feat", "optfeature", "status",
]);

// ─── Props ───────────────────────────────────────────────

interface RichTextProps {
  entries: Entry[];
  /** Callback when a clickable tag is clicked (spell, condition, item, etc.) */
  onTagClick?: (tag: ParsedTag, event: React.MouseEvent) => void;
  /** Additional CSS classes for the root container */
  className?: string;
  /** If true, render inline (no wrapping div, no paragraph spacing) */
  inline?: boolean;
}

// ─── Component ───────────────────────────────────────────

export function RichText({ entries, onTagClick, className = "", inline = false }: RichTextProps) {
  if (!entries || entries.length === 0) return null;

  const rendered = entries.map((entry, i) => (
    <RenderEntry key={i} entry={entry} onTagClick={onTagClick} depth={0} />
  ));

  if (inline) {
    return <span className={className}>{rendered}</span>;
  }

  return (
    <div className={`rich-text space-y-2 text-sm text-gray-300 leading-relaxed ${className}`}>
      {rendered}
    </div>
  );
}

// ─── Entry renderer ──────────────────────────────────────

function RenderEntry({
  entry,
  onTagClick,
  depth,
}: {
  entry: Entry;
  onTagClick?: (tag: ParsedTag, event: React.MouseEvent) => void;
  depth: number;
}) {
  if (typeof entry === "string") {
    return <RenderTaggedText text={entry} onTagClick={onTagClick} />;
  }

  if (!entry || typeof entry !== "object") return null;

  switch (entry.type) {
    case "entries":
      return <RenderEntries entry={entry as EntryEntries} onTagClick={onTagClick} depth={depth} />;
    case "section":
      return <RenderSection entry={entry as EntrySection} onTagClick={onTagClick} depth={depth} />;
    case "inset":
      return <RenderInset entry={entry as EntryInset} onTagClick={onTagClick} depth={depth} />;
    case "insetReadaloud":
      return <RenderReadaloud entry={entry as EntryInsetReadaloud} onTagClick={onTagClick} depth={depth} />;
    case "quote":
      return <RenderQuote entry={entry as EntryQuote} onTagClick={onTagClick} depth={depth} />;
    case "list":
      return <RenderList entry={entry as EntryList} onTagClick={onTagClick} depth={depth} />;
    case "item":
      return <RenderItem entry={entry as EntryItem} onTagClick={onTagClick} depth={depth} />;
    case "itemSub":
    case "itemSpell":
      return <RenderListItem entry={entry as EntryListItem} onTagClick={onTagClick} depth={depth} />;
    case "table":
      return <RenderTable entry={entry as EntryTable} onTagClick={onTagClick} depth={depth} />;
    case "tableGroup":
      return <RenderTableGroup entry={entry as EntryTableGroup} onTagClick={onTagClick} depth={depth} />;
    case "dice":
      return <RenderDice entry={entry as EntryDice} />;
    case "bonus":
      return <RenderBonus entry={entry as EntryBonus} />;
    case "bonusSpeed":
      return <RenderBonusSpeed entry={entry as EntryBonusSpeed} />;
    case "abilityDc":
      return <RenderAbilityDc entry={entry as EntryAbilityDc} />;
    case "abilityAttackMod":
      return <RenderAbilityAttackMod entry={entry as EntryAbilityAttackMod} />;
    case "abilityGeneric":
      return <RenderAbilityGeneric entry={entry as EntryAbilityGeneric} onTagClick={onTagClick} />;
    case "spellcasting":
      return <RenderSpellcasting entry={entry as EntrySpellcasting} onTagClick={onTagClick} depth={depth} />;
    case "hr":
      return <RenderHr />;
    case "link":
      return <RenderLink entry={entry as EntryLink} />;
    case "cell":
      return <RenderCell entry={entry as EntryCell} onTagClick={onTagClick} depth={depth} />;
    case "options":
      return <RenderOptions entry={entry as EntryOptions} onTagClick={onTagClick} depth={depth} />;
    case "inline":
      return <RenderInlineEntry entry={entry as EntryInline} onTagClick={onTagClick} depth={depth} />;
    case "inlineBlock":
      return <RenderInlineBlock entry={entry as EntryInlineBlock} onTagClick={onTagClick} depth={depth} />;
    case "image":
      return <RenderImage entry={entry as EntryImage} />;
    case "flowchart":
      return <RenderFlowchart entry={entry as EntryFlowchart} onTagClick={onTagClick} depth={depth} />;
    case "flowBlock":
      return <RenderFlowBlock entry={entry as EntryFlowBlock} onTagClick={onTagClick} depth={depth} />;
    case "refOptionalfeature":
      return <RenderOptFeatureRef entry={entry as EntryOptionalFeature} onTagClick={onTagClick} />;
    case "refClassFeature":
      return <RenderClassFeatureRef entry={entry as EntryClassFeature} onTagClick={onTagClick} />;
    case "refSubclassFeature":
      return <RenderSubclassFeatureRef entry={entry as EntrySubclassFeature} onTagClick={onTagClick} />;
    default:
      return null;
  }
}

// ─── Tagged text parser (handles {@tag} inline markup) ───

function RenderTaggedText({
  text,
  onTagClick,
}: {
  text: string;
  onTagClick?: (tag: ParsedTag, event: React.MouseEvent) => void;
}): ReactNode {
  const parts = parseTags(text);
  if (parts.length === 1 && typeof parts[0] === "string") {
    return <>{parts[0]}</>;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === "string") return <Fragment key={i}>{part}</Fragment>;

        const tag = part as ParsedTag;
        const display = tag.displayText || tag.name;
        const style = TAG_STYLES[tag.type] || "text-gray-300";
        const isClickable = CLICKABLE_TAGS.has(tag.type) && onTagClick;

        if (tag.type === "atk") {
          const atkMap: Record<string, string> = { mw: "Melee Weapon", rw: "Ranged Weapon", ms: "Melee Spell", rs: "Ranged Spell" };
          return <em key={i} className="text-amber-300">{atkMap[tag.name] || tag.name} Attack:</em>;
        }

        if (isClickable) {
          return (
            <button
              key={i}
              className={`${style} inline`}
              onClick={(e) => onTagClick(tag, e)}
            >
              {display}
            </button>
          );
        }

        return <span key={i} className={style}>{display}</span>;
      })}
    </>
  );
}

// ─── Structural renderers ────────────────────────────────

function RenderEntries({ entry, onTagClick, depth }: { entry: EntryEntries; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className={depth > 0 ? "mt-1" : ""}>
      {entry.name && (
        <div className={`font-semibold text-gray-200 ${depth === 0 ? "text-sm mb-1" : "text-xs mb-0.5"}`}>
          <RenderTaggedText text={entry.name} onTagClick={onTagClick} />
        </div>
      )}
      <div className="space-y-1.5">
        {entry.entries.map((e, i) => (
          <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

function RenderSection({ entry, onTagClick, depth }: { entry: EntrySection; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="mt-3">
      {entry.name && (
        <h4 className="text-sm font-semibold text-amber-200/80 mb-1.5" style={{ fontFamily: "var(--font-cinzel)" }}>
          {entry.name}
        </h4>
      )}
      <div className="space-y-1.5">
        {entry.entries.map((e, i) => (
          <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

function RenderInset({ entry, onTagClick, depth }: { entry: EntryInset; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="border-l-2 border-amber-600/30 pl-3 my-2 bg-amber-900/5 py-1.5 rounded-r">
      {entry.name && (
        <div className="text-xs font-semibold text-amber-300/80 mb-1">{entry.name}</div>
      )}
      <div className="space-y-1 text-sm text-gray-400">
        {entry.entries.map((e, i) => (
          <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

function RenderReadaloud({ entry, onTagClick, depth }: { entry: EntryInsetReadaloud; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="border-l-2 border-amber-500/40 pl-3 my-2 bg-amber-900/10 py-2 rounded-r italic text-amber-100/70">
      {entry.name && (
        <div className="text-xs font-semibold text-amber-300 mb-1 not-italic">{entry.name}</div>
      )}
      <div className="space-y-1">
        {entry.entries.map((e, i) => (
          <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

function RenderQuote({ entry, onTagClick, depth }: { entry: EntryQuote; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <blockquote className="border-l-2 border-gray-600/40 pl-3 my-2 text-gray-400 italic">
      <div className="space-y-1">
        {entry.entries.map((e, i) => (
          <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
        ))}
      </div>
      {(entry.by || entry.from) && (
        <div className="text-xs text-gray-500 mt-1 not-italic">
          {entry.by && <span>— {entry.by}</span>}
          {entry.from && <span>, {entry.from}</span>}
        </div>
      )}
    </blockquote>
  );
}

function RenderList({ entry, onTagClick, depth }: { entry: EntryList; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  const isNumbered = entry.style === "list-decimal";

  return (
    <div>
      {entry.name && (
        <div className="text-xs font-semibold text-gray-200 mb-1">
          <RenderTaggedText text={entry.name} onTagClick={onTagClick} />
        </div>
      )}
      {isNumbered ? (
        <ol className="list-decimal list-inside space-y-0.5 text-sm">
          {entry.items.map((item, i) => (
            <li key={i} className="text-gray-300">
              <RenderEntry entry={item as Entry} onTagClick={onTagClick} depth={depth + 1} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {entry.items.map((item, i) => (
            <li key={i} className="text-gray-300 flex gap-1.5">
              <span className="text-gray-600 shrink-0 mt-0.5">•</span>
              <span className="flex-1">
                <RenderEntry entry={item as Entry} onTagClick={onTagClick} depth={depth + 1} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RenderItem({ entry, onTagClick, depth }: { entry: EntryItem; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div>
      <span className="font-semibold text-gray-200">
        <RenderTaggedText text={entry.name} onTagClick={onTagClick} />
      </span>
      {entry.entry && (
        <span className="ml-1">
          <RenderEntry entry={entry.entry} onTagClick={onTagClick} depth={depth + 1} />
        </span>
      )}
      {entry.entries && (
        <div className="ml-0 mt-0.5 space-y-1">
          {entry.entries.map((e, i) => (
            <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function RenderListItem({ entry, onTagClick, depth }: { entry: EntryListItem; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div>
      <span className={`font-medium ${entry.type === "itemSpell" ? "text-amber-300" : "text-gray-300"}`}>
        <RenderTaggedText text={entry.name} onTagClick={onTagClick} />
      </span>
      {entry.entry && (
        <span className="ml-1 text-gray-400">
          <RenderEntry entry={entry.entry} onTagClick={onTagClick} depth={depth + 1} />
        </span>
      )}
      {entry.entries && (
        <div className="mt-0.5 space-y-1 text-gray-400">
          {entry.entries.map((e, i) => (
            <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Table ───────────────────────────────────────────────

function RenderTable({ entry, onTagClick, depth }: { entry: EntryTable; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="my-2 overflow-x-auto">
      {entry.caption && (
        <div className="text-xs font-semibold text-amber-200/70 mb-1">{entry.caption}</div>
      )}
      <table className="w-full text-xs border-collapse">
        {entry.colLabels && (
          <thead>
            <tr className="border-b border-gray-700/50">
              {entry.colLabels.map((label, i) => (
                <th
                  key={i}
                  className="text-left text-gray-400 font-medium px-2 py-1.5 uppercase tracking-wider text-[10px]"
                >
                  <RenderTaggedText text={label} onTagClick={onTagClick} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {entry.rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-gray-800/20" : ""}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 text-gray-300">
                  <RenderEntry entry={cell} onTagClick={onTagClick} depth={depth + 1} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RenderTableGroup({ entry, onTagClick, depth }: { entry: EntryTableGroup; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="space-y-2">
      {entry.tables.map((t, i) => (
        <RenderTable key={i} entry={t} onTagClick={onTagClick} depth={depth} />
      ))}
    </div>
  );
}

// ─── Inline value renderers ─────────────────────────────

function RenderDice({ entry }: { entry: EntryDice }) {
  if (!entry.toRoll) return null;
  const text = entry.toRoll
    .map((r) => `${r.number}d${r.faces}${r.modifier ? (r.modifier > 0 ? `+${r.modifier}` : `${r.modifier}`) : ""}`)
    .join(" + ");
  return <span className="text-amber-300 font-mono">{text}</span>;
}

function RenderBonus({ entry }: { entry: EntryBonus }) {
  return <span className="text-amber-300 font-mono">{entry.value >= 0 ? "+" : ""}{entry.value}</span>;
}

function RenderBonusSpeed({ entry }: { entry: EntryBonusSpeed }) {
  return <span className="text-amber-300 font-mono">{entry.value >= 0 ? "+" : ""}{entry.value} ft.</span>;
}

function RenderAbilityDc({ entry }: { entry: EntryAbilityDc }) {
  return (
    <span className="text-gray-300">
      <span className="font-semibold text-amber-300">{entry.name} save DC</span> = 8 + your proficiency bonus + your {entry.attributes.join(" or ")} modifier
    </span>
  );
}

function RenderAbilityAttackMod({ entry }: { entry: EntryAbilityAttackMod }) {
  return (
    <span className="text-gray-300">
      <span className="font-semibold text-amber-300">{entry.name} attack modifier</span> = your proficiency bonus + your {entry.attributes.join(" or ")} modifier
    </span>
  );
}

function RenderAbilityGeneric({ entry, onTagClick }: { entry: EntryAbilityGeneric; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void }) {
  return (
    <span className="text-gray-300">
      {entry.name && <span className="font-semibold text-amber-300">{entry.name} = </span>}
      <RenderTaggedText text={entry.text} onTagClick={onTagClick} />
    </span>
  );
}

// ─── Spellcasting block ─────────────────────────────────

function RenderSpellcasting({ entry, onTagClick, depth }: { entry: EntrySpellcasting; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold text-amber-200/80 italic">{entry.name}</div>
      {entry.headerEntries?.map((e, i) => (
        <RenderEntry key={`h${i}`} entry={e} onTagClick={onTagClick} depth={depth + 1} />
      ))}
      {entry.will && entry.will.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 uppercase">At will: </span>
          <span className="text-gray-300">
            {entry.will.map((s, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                <RenderTaggedText text={s} onTagClick={onTagClick} />
              </Fragment>
            ))}
          </span>
        </div>
      )}
      {entry.daily && Object.entries(entry.daily).map(([freq, spells]) => (
        <div key={freq}>
          <span className="text-xs text-gray-500 uppercase">{freq.replace("e", "")}/day each: </span>
          <span className="text-gray-300">
            {spells.map((s, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                <RenderTaggedText text={s} onTagClick={onTagClick} />
              </Fragment>
            ))}
          </span>
        </div>
      ))}
      {entry.spells && Object.entries(entry.spells).map(([level, data]) => (
        <div key={level}>
          <span className="text-xs text-gray-500 uppercase">
            {level === "0" ? "Cantrips" : `Level ${level}`}
            {data.slots != null && ` (${data.slots} slots)`}
            {data.atWill && " (at will)"}
            :{" "}
          </span>
          <span className="text-gray-300">
            {data.spells.map((s, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                <RenderTaggedText text={s} onTagClick={onTagClick} />
              </Fragment>
            ))}
          </span>
        </div>
      ))}
      {entry.footerEntries?.map((e, i) => (
        <RenderEntry key={`f${i}`} entry={e} onTagClick={onTagClick} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── Simple renderers ───────────────────────────────────

function RenderHr() {
  return <div className="h-px bg-gradient-to-r from-gray-700/50 via-gray-600/30 to-transparent my-2" />;
}

function RenderLink({ entry }: { entry: EntryLink }) {
  const href = typeof entry.href === "object" && "url" in entry.href ? entry.href.url : "#";
  return (
    <a href={href} className="text-amber-400 hover:text-amber-300 underline" target="_blank" rel="noopener noreferrer">
      {entry.text}
    </a>
  );
}

function RenderCell({ entry, onTagClick, depth }: { entry: EntryCell; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  if (entry.roll) {
    if ("exact" in entry.roll) return <span className="text-gray-300">{entry.roll.exact}</span>;
    return <span className="text-gray-300">{entry.roll.min}–{entry.roll.max}</span>;
  }
  if (entry.entry) return <RenderEntry entry={entry.entry} onTagClick={onTagClick} depth={depth} />;
  return null;
}

function RenderOptions({ entry, onTagClick, depth }: { entry: EntryOptions; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="space-y-1">
      {entry.count && <div className="text-xs text-gray-500">Choose {entry.count}:</div>}
      {entry.entries.map((e, i) => (
        <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
      ))}
    </div>
  );
}

function RenderInlineEntry({ entry, onTagClick, depth }: { entry: EntryInline; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <span>
      {entry.entries.map((e, i) => (
        <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
      ))}
    </span>
  );
}

function RenderInlineBlock({ entry, onTagClick, depth }: { entry: EntryInlineBlock; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <span className="inline-block">
      {entry.entries.map((e, i) => (
        <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
      ))}
    </span>
  );
}

function RenderImage({ entry }: { entry: EntryImage }) {
  // Skip external image loading for security — just show alt text
  return entry.title || entry.altText ? (
    <div className="text-xs text-gray-500 italic">[Image: {entry.title || entry.altText}]</div>
  ) : null;
}

function RenderFlowchart({ entry, onTagClick, depth }: { entry: EntryFlowchart; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="space-y-1 border-l border-gray-700/40 pl-3">
      {entry.blocks.map((block, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="text-gray-600 text-center text-xs">↓</div>}
          <RenderFlowBlock entry={block} onTagClick={onTagClick} depth={depth + 1} />
        </Fragment>
      ))}
    </div>
  );
}

function RenderFlowBlock({ entry, onTagClick, depth }: { entry: EntryFlowBlock; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void; depth: number }) {
  return (
    <div className="bg-gray-800/30 rounded px-2 py-1.5 border border-gray-700/30">
      {entry.name && <div className="text-xs font-semibold text-gray-200 mb-0.5">{entry.name}</div>}
      <div className="space-y-1">
        {entry.entries.map((e, i) => (
          <RenderEntry key={i} entry={e} onTagClick={onTagClick} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

// ─── Reference renderers ────────────────────────────────

function RenderOptFeatureRef({ entry, onTagClick }: { entry: EntryOptionalFeature; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void }) {
  const tag: ParsedTag = { type: "optfeature", name: entry.optionalfeature, original: entry.optionalfeature };
  if (onTagClick) {
    return (
      <button className={TAG_STYLES.optfeature} onClick={(e) => onTagClick(tag, e)}>
        {entry.optionalfeature}
      </button>
    );
  }
  return <span className="text-cyan-400">{entry.optionalfeature}</span>;
}

function RenderClassFeatureRef({ entry, onTagClick: _onTagClick }: { entry: EntryClassFeature; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void }) {
  const parts = entry.classFeature.split("|");
  return <span className="text-amber-300 font-medium">{parts[0]}</span>;
}

function RenderSubclassFeatureRef({ entry, onTagClick: _onTagClick }: { entry: EntrySubclassFeature; onTagClick?: (tag: ParsedTag, e: React.MouseEvent) => void }) {
  const parts = entry.subclassFeature.split("|");
  return <span className="text-amber-300 font-medium">{parts[0]}</span>;
}
