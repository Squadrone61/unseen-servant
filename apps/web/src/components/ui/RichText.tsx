import type { EntityCategory } from "@unseen-servant/shared/types";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Category styling
// ---------------------------------------------------------------------------

const categoryStyles: Record<EntityCategory, string> = {
  condition: "text-red-400",
  spell: "text-violet-400",
  action: "text-blue-400",
  item: "text-amber-400",
  rule: "font-semibold text-gray-200",
  feat: "text-emerald-400",
  class: "text-emerald-400",
  species: "text-emerald-400",
  background: "text-emerald-400",
  disease: "text-orange-400",
  status: "text-orange-400",
  "ability-score": "text-amber-300",
  "class-feature": "text-amber-300",
  "choice-option": "text-gray-300",
  "inventory-item": "text-amber-400",
  optional_feature: "text-violet-400",
};

const KNOWN_CATEGORIES = new Set<string>([
  "condition",
  "spell",
  "action",
  "item",
  "class",
  "feat",
  "species",
  "background",
  "disease",
  "status",
  "rule",
  "ability-score",
  "class-feature",
  "choice-option",
  "inventory-item",
]);

// ---------------------------------------------------------------------------
// Parsing types
// ---------------------------------------------------------------------------

type TextSegment = { kind: "text"; value: string };
type EntitySegment = { kind: "entity"; category: EntityCategory; name: string; display: string };
type Segment = TextSegment | EntitySegment;

// ---------------------------------------------------------------------------
// Inline segment parser
// Handles {category:name} and {category:name|display text}
// ---------------------------------------------------------------------------

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match {category:name} or {category:name|display text}
  const pattern = /\{([a-z]+):([^|}]+)(?:\|([^}]+))?\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [full, rawCategory, name, display] = match;

    // Push preceding plain text
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }

    if (KNOWN_CATEGORIES.has(rawCategory)) {
      segments.push({
        kind: "entity",
        category: rawCategory as EntityCategory,
        name: name.trim(),
        display: (display ?? name).trim(),
      });
    } else {
      // Unknown category — treat the whole match as plain text
      segments.push({ kind: "text", value: full });
    }

    lastIndex = match.index + full.length;
  }

  // Trailing plain text
  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Inline markdown renderer (bold / italic) applied within a plain text value
// ---------------------------------------------------------------------------

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  // Process **bold** and *italic* (bold first to avoid greedy single-star match)
  const nodes: ReactNode[] = [];
  // Pattern: **bold** | *italic* (non-greedy)
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }

    if (match[0].startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[2]}</strong>);
    } else {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{match[3]}</em>);
    }

    last = match.index + match[0].length;
    i++;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Entity click handler type
// ---------------------------------------------------------------------------

type EntityClickHandler = (
  category: EntityCategory,
  name: string,
  position: { x: number; y: number },
) => void;

// ---------------------------------------------------------------------------
// Render a single line's segments (inline entities + markdown)
// ---------------------------------------------------------------------------

function renderLineSegments(
  segments: Segment[],
  lineKey: string,
  onEntityClick?: EntityClickHandler,
): ReactNode {
  return segments.map((seg, idx) => {
    if (seg.kind === "entity") {
      const colorClass = categoryStyles[seg.category];
      // "rule" category has no backing data — keep as styled text only
      const isClickable = onEntityClick && seg.category !== "rule";
      return (
        <span
          key={`${lineKey}-e${idx}`}
          className={`${colorClass} ${isClickable ? "cursor-pointer" : "cursor-help"} underline decoration-dotted underline-offset-2`}
          title={`${seg.category}: ${seg.name}`}
          data-entity={`${seg.category}:${seg.name}`}
          onClick={
            isClickable
              ? (e) => {
                  e.stopPropagation();
                  onEntityClick(seg.category, seg.name, { x: e.clientX, y: e.clientY });
                }
              : undefined
          }
        >
          {seg.display}
        </span>
      );
    }
    // Plain text — apply inline markdown
    return (
      <span key={`${lineKey}-t${idx}`}>
        {renderInlineMarkdown(seg.value, `${lineKey}-t${idx}`)}
      </span>
    );
  });
}

// ---------------------------------------------------------------------------
// Table parsing
// ---------------------------------------------------------------------------

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return isTableRow(line) && /^\|[\s\-|:]+\|$/.test(line.trim());
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1) // remove leading/trailing |
    .split("|")
    .map((c) => c.trim());
}

// ---------------------------------------------------------------------------
// Block-level renderer
// Handles newlines, bullet lists, tables, paragraphs
// ---------------------------------------------------------------------------

interface Block {
  type: "paragraph" | "bullet-list" | "table";
  lines: string[];
}

function groupBlocks(rawLines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    if (line === "") {
      i++;
      continue;
    }

    // Table block: collect consecutive table rows
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < rawLines.length && isTableRow(rawLines[i])) {
        tableLines.push(rawLines[i]);
        i++;
      }
      blocks.push({ type: "table", lines: tableLines });
      continue;
    }

    // Bullet list block
    if (line.startsWith("• ") || line.startsWith("- ")) {
      const listLines: string[] = [];
      while (
        i < rawLines.length &&
        (rawLines[i].startsWith("• ") || rawLines[i].startsWith("- "))
      ) {
        listLines.push(rawLines[i]);
        i++;
      }
      blocks.push({ type: "bullet-list", lines: listLines });
      continue;
    }

    // Paragraph: collect consecutive non-empty, non-table, non-bullet lines
    const paraLines: string[] = [];
    while (
      i < rawLines.length &&
      rawLines[i] !== "" &&
      !isTableRow(rawLines[i]) &&
      !rawLines[i].startsWith("• ") &&
      !rawLines[i].startsWith("- ")
    ) {
      paraLines.push(rawLines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paraLines });
    }
  }

  return blocks;
}

function renderBlock(
  block: Block,
  blockIdx: number,
  onEntityClick?: EntityClickHandler,
): ReactNode {
  const bk = `block-${blockIdx}`;

  if (block.type === "paragraph") {
    return (
      <p key={bk} className="mb-1 last:mb-0">
        {block.lines.map((line, li) => {
          const segments = parseSegments(line);
          return (
            <span key={`${bk}-l${li}`}>
              {li > 0 && <br />}
              {renderLineSegments(segments, `${bk}-l${li}`, onEntityClick)}
            </span>
          );
        })}
      </p>
    );
  }

  if (block.type === "bullet-list") {
    return (
      <ul key={bk} className="mb-1 space-y-0.5 pl-4 last:mb-0">
        {block.lines.map((line, li) => {
          // Strip leading bullet character
          const content = line.replace(/^[•-]\s/, "");
          const segments = parseSegments(content);
          return (
            <li key={`${bk}-li${li}`} className="flex gap-2">
              <span className="mt-px shrink-0 text-gray-500 select-none">&bull;</span>
              <span>{renderLineSegments(segments, `${bk}-li${li}`, onEntityClick)}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  if (block.type === "table") {
    // Filter out separator rows, treat first non-separator row as header
    const dataRows = block.lines.filter((l) => !isSeparatorRow(l));
    const [headerRow, ...bodyRows] = dataRows;

    const headerCells = headerRow ? parseTableCells(headerRow) : [];

    return (
      <div key={bk} className="mb-1 overflow-x-auto last:mb-0">
        <table className="w-full border-collapse text-sm">
          {headerCells.length > 0 && (
            <thead>
              <tr>
                {headerCells.map((cell, ci) => (
                  <th
                    key={`${bk}-th${ci}`}
                    className="border border-gray-700 bg-gray-800/60 px-2 py-1 text-left font-semibold text-gray-300"
                  >
                    {renderLineSegments(parseSegments(cell), `${bk}-th${ci}`, onEntityClick)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          {bodyRows.length > 0 && (
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={`${bk}-tr${ri}`} className="even:bg-gray-800/30">
                  {parseTableCells(row).map((cell, ci) => (
                    <td
                      key={`${bk}-td${ri}-${ci}`}
                      className="border border-gray-700/60 px-2 py-1 text-gray-400"
                    >
                      {renderLineSegments(
                        parseSegments(cell),
                        `${bk}-td${ri}-${ci}`,
                        onEntityClick,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface RichTextProps {
  text: string;
  className?: string;
  onEntityClick?: EntityClickHandler;
}

export function RichText({ text, className, onEntityClick }: RichTextProps) {
  const rawLines = text.split("\n");
  const blocks = groupBlocks(rawLines);

  return (
    <div className={className}>
      {blocks.map((block, idx) => renderBlock(block, idx, onEntityClick))}
    </div>
  );
}
