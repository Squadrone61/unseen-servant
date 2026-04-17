import { useState } from "react";
import type { RollResult } from "@unseen-servant/shared/types";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { preprocessEntityTags } from "../../utils/entity-tags";
import type { DisplayMessage } from "./ChatPanel";
import { useTTS } from "../../hooks/useTTS";
import { Button } from "@/components/ui/Button";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ChatMessageProps {
  message: DisplayMessage;
  onRollDice?: (checkRequestId: string, message?: string) => void;
  myCharacterName?: string;
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mt-3 mb-1 text-xl font-bold text-amber-300">{children}</h1>,
  h2: ({ children }) => (
    <h2 className="mt-2.5 mb-1 text-lg font-bold text-amber-300">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-0.5 text-base font-bold text-amber-300">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-1.5 mb-0.5 text-sm font-bold text-amber-300">{children}</h4>
  ),
  p: ({ children }) => <p className="mb-2 text-gray-200 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-gray-100">{children}</strong>,
  em: ({ children }) => <em className="text-gray-300 italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 ml-2 list-inside list-disc space-y-0.5 text-gray-200">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-2 list-inside list-decimal space-y-0.5 text-gray-200">{children}</ol>
  ),
  li: ({ children }) => <li className="text-gray-200">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-amber-400/50 pl-3 text-gray-300 italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="my-2 block overflow-x-auto rounded bg-gray-800/60 p-2 font-mono text-sm text-gray-200">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-gray-800/60 px-1 py-0.5 font-mono text-sm text-amber-300">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-1">{children}</pre>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-amber-400 underline hover:text-amber-300"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-gray-700/50" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full text-sm text-gray-200">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-700/40 bg-gray-800/60 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-gray-700/40 px-2 py-1">{children}</td>,
};

function TTSButton({ text }: { text: string }) {
  const { speak, stop, isSpeaking } = useTTS();

  return (
    <button
      onClick={() => (isSpeaking ? stop() : speak(text))}
      className="shrink-0 rounded p-1 text-amber-400 transition-colors hover:bg-amber-800/40 hover:text-amber-300"
      title={isSpeaking ? "Stop narration" : "Listen to narration"}
      aria-label={isSpeaking ? "Stop narration" : "Listen to narration"}
    >
      {isSpeaking ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M10 3.75a.75.75 0 00-1.264-.546L4.703 7H3.167a.75.75 0 00-.7.48A6.985 6.985 0 002 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h1.535l4.033 3.796A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
          <path d="M13.829 7.172a.75.75 0 00-1.061 1.06 2.5 2.5 0 010 3.536.75.75 0 001.06 1.06 4 4 0 000-5.656z" />
        </svg>
      )}
    </button>
  );
}

/** Renders individual die results as small badges: d20 [15] (dropped dice are dimmed + struck through) */
function DieBadges({ roll }: { roll: RollResult }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {roll.rolls.map((r, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-0.5 ${r.dropped ? "opacity-40" : ""}`}
        >
          <span className={`text-xs text-gray-500 ${r.dropped ? "line-through" : ""}`}>
            d{r.die}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
              r.dropped
                ? "bg-gray-700/50 text-gray-500 line-through"
                : "bg-gray-700/80 text-gray-200"
            }`}
          >
            {r.result}
          </span>
        </span>
      ))}
      {roll.modifier !== 0 && (
        <span className="font-mono text-xs text-gray-400">
          {roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}
        </span>
      )}
    </span>
  );
}

/** Check roll display: d20 [15] +3 = 18 vs DC 15 */
function CheckRollDisplay({ roll, dc }: { roll: RollResult; dc?: number }) {
  const isCrit = roll.criticalHit;
  const isFail = roll.criticalFail;
  const totalColor = isCrit ? "text-yellow-400" : isFail ? "text-red-400" : "text-gray-100";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DieBadges roll={roll} />
      <span className="text-gray-500">=</span>
      <span className={`text-sm font-bold ${totalColor}`}>{roll.total}</span>
      {dc !== undefined && <span className="text-xs text-gray-500">vs DC {dc}</span>}
    </div>
  );
}

/** Damage roll display: d6 [4] d6 [2] +3 = 9 */
function DamageRollDisplay({ roll }: { roll: RollResult }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DieBadges roll={roll} />
      <span className="text-gray-500">=</span>
      <span className="text-sm font-bold text-orange-300">{roll.total}</span>
      <span className="text-xs text-gray-500">damage</span>
    </div>
  );
}

/** Result badge pill */
function ResultBadge({
  success,
  isCrit,
  isFail,
}: {
  success?: boolean;
  isCrit?: boolean;
  isFail?: boolean;
}) {
  if (isCrit) {
    return (
      <span className="rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-xs font-bold text-yellow-400 uppercase">
        Critical!
      </span>
    );
  }

  if (isFail) {
    return (
      <span className="rounded-full border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400 uppercase">
        Critical Fail!
      </span>
    );
  }

  return success ? (
    <span className="rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-bold text-green-400 uppercase">
      Success
    </span>
  ) : (
    <span className="rounded-full border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400 uppercase">
      Failure
    </span>
  );
}

/** Consolidated check card — used for merged_check and bare check_request */
function CheckCard({
  message,
  onRollDice,
  myCharacterName,
}: {
  message: DisplayMessage;
  onRollDice?: (checkRequestId: string, message?: string) => void;
  myCharacterName?: string;
}) {
  const [playerNote, setPlayerNote] = useState("");

  // Extract fields depending on message type
  const isMerged = message.type === "merged_check";
  const isBare = message.type === "server:check_request";

  const request = isMerged ? message.request : isBare ? message.check : null;

  if (!request) return null;

  const roll = isMerged ? message.roll : null;
  const result = isMerged ? message.result : null;
  // A check is a "damage roll" when checkType is explicitly "damage",
  // or when there is no checkType and no dc (pure notation roll).
  const isDamage =
    request.checkType === "damage" || (!request.checkType && request.dc === undefined);
  // Label: capitalize checkType with underscores → spaces, fall back to reason
  const checkLabel = request.checkType
    ? request.checkType
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : request.reason;

  const isCrit = roll?.criticalHit;
  const isFail = roll?.criticalFail;
  const success = result?.success;

  // Border/bg colors
  let borderColor = "border-amber-500";
  let bgColor = "bg-amber-900/20";

  if (roll) {
    if (isDamage) {
      // Damage rolls are always neutral
      borderColor = "border-blue-500";
      bgColor = "bg-blue-900/20";
    } else if (isCrit) {
      borderColor = "border-yellow-400";
      bgColor = "bg-yellow-900/20";
    } else if (isFail) {
      borderColor = "border-red-500";
      bgColor = "bg-red-900/20";
    } else if (result && success !== undefined) {
      borderColor = success ? "border-green-500" : "border-red-500";
      bgColor = success ? "bg-green-900/20" : "bg-red-900/20";
    } else if (result) {
      borderColor = "border-blue-500";
      bgColor = "bg-blue-900/20";
    } else {
      // Roll present but no result — neutral
      borderColor = "border-blue-500";
      bgColor = "bg-blue-900/20";
    }
  }

  const isMyCheck =
    myCharacterName && request.targetCharacter.toLowerCase() === myCharacterName.toLowerCase();

  return (
    <div className={`rounded-r-lg border-l-4 p-3 ${bgColor} ${borderColor}`}>
      {/* Header: check type + DC badge + result badge */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">&#127922;</span>
          <span className="text-sm font-semibold text-gray-200">
            {isDamage ? "Damage Roll" : checkLabel}
          </span>
          {!isDamage && request.dc !== undefined && (
            <span className="rounded bg-gray-700/60 px-1.5 py-0.5 font-mono text-xs text-gray-300">
              DC {request.dc}
            </span>
          )}
        </div>
        {isMerged && !isDamage && (success !== undefined || isCrit || isFail) && (
          <ResultBadge success={success} isCrit={isCrit} isFail={isFail} />
        )}
      </div>

      {/* Subtext: character name + reason */}
      <div className="mb-1.5 text-xs text-gray-400">
        <span className="text-gray-300">{request.targetCharacter}</span>
        {" — "}
        {request.reason}
      </div>

      {/* Dice roll display */}
      {roll && (
        <div className="mt-1">
          {isDamage ? (
            <DamageRollDisplay roll={roll} />
          ) : (
            <CheckRollDisplay roll={roll} dc={request.dc} />
          )}
        </div>
      )}

      {/* Player note on merged checks */}
      {isMerged && result?.playerMessage && (
        <div className="mt-1.5 text-xs text-gray-400 italic">
          <span className="text-gray-500">Note:</span> {result.playerMessage}
        </div>
      )}

      {/* Roll input + button for bare check_request */}
      {isBare && isMyCheck && onRollDice && (
        <div className="mt-2 space-y-2">
          <input
            type="text"
            placeholder="Add a note (optional)..."
            value={playerNote}
            onChange={(e) => setPlayerNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRollDice(request.id, playerNote.trim() || undefined);
              }
            }}
            maxLength={500}
            className="w-full rounded border border-gray-600 bg-gray-800/50 px-2 py-1 text-sm text-gray-200 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => onRollDice(request.id, playerNote.trim() || undefined)}
          >
            {`Roll ${request.notation}`}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message, onRollDice, myCharacterName }: ChatMessageProps) {
  switch (message.type) {
    case "server:chat":
      return (
        <div className="flex gap-2">
          <span className="shrink-0 font-bold text-blue-400">{message.playerName}:</span>
          <span className="flex-1 text-gray-200">{message.content}</span>
          {"timestamp" in message && typeof message.timestamp === "number" && (
            <span className="shrink-0 self-start text-xs text-gray-600">
              {formatTime(message.timestamp)}
            </span>
          )}
        </div>
      );

    case "server:ai":
      return (
        <div className="rounded-r-lg border-l-4 border-amber-500 bg-amber-900/20 p-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="text-sm font-semibold text-amber-400"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                Dungeon Master
              </div>
              {"timestamp" in message && typeof message.timestamp === "number" && (
                <span className="text-xs text-gray-600">{formatTime(message.timestamp)}</span>
              )}
            </div>
            <TTSButton text={message.content} />
          </div>
          <div className="prose-invert max-w-none leading-relaxed text-gray-200">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={markdownComponents}
            >
              {preprocessEntityTags(message.content)}
            </ReactMarkdown>
          </div>
        </div>
      );

    case "server:system":
      return <div className="py-1 text-center text-sm text-gray-500 italic">{message.content}</div>;

    case "server:error":
      return (
        <div className="rounded bg-red-900/20 p-2 text-center text-sm text-red-400">
          Error: {message.message}
        </div>
      );

    // All check-related messages use the consolidated CheckCard
    case "server:check_request":
    case "merged_check":
      return (
        <CheckCard message={message} onRollDice={onRollDice} myCharacterName={myCharacterName} />
      );

    // Standalone dice_roll (DM rolls not tied to checks, or unlinked legacy rolls)
    case "server:dice_roll": {
      const roll = message.roll;
      const isCrit = roll.criticalHit;
      const isFail = roll.criticalFail;

      // Compact inline format for DM rolls to reduce chat clutter
      if (message.playerName === "DM") {
        return (
          <div className="flex items-center gap-2 px-2 py-1 text-sm text-gray-400">
            <span className="text-xs">&#127922;</span>
            <span className="text-gray-500">DM rolled</span>
            <DieBadges roll={roll} />
            <span className="text-gray-500">=</span>
            <span
              className={`font-bold ${isCrit ? "text-yellow-400" : isFail ? "text-red-400" : "text-gray-300"}`}
            >
              {roll.total}
            </span>
            {roll.label && <span className="text-gray-600">({roll.label})</span>}
          </div>
        );
      }

      return (
        <div
          className={`rounded-r-lg border-l-4 p-3 ${
            isCrit
              ? "border-yellow-400 bg-yellow-900/20"
              : isFail
                ? "border-red-500 bg-red-900/20"
                : "border-blue-500 bg-blue-900/20"
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg">&#127922;</span>
            <span className="text-xs font-semibold text-gray-400 uppercase">
              {message.playerName} rolled
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <DieBadges roll={roll} />
            <span className="text-gray-500">=</span>
            <span
              className={`text-xl font-bold ${
                isCrit ? "text-yellow-400" : isFail ? "text-red-400" : "text-blue-300"
              }`}
            >
              {roll.total}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray-400">{roll.label}</div>
          {isCrit && <div className="mt-1 text-xs font-bold text-yellow-400">CRITICAL HIT!</div>}
          {isFail && <div className="mt-1 text-xs font-bold text-red-400">CRITICAL FAIL!</div>}
        </div>
      );
    }

    // Standalone check_result fallback (shouldn't appear if merge works)
    case "server:check_result": {
      const res = message.result;
      const success = res.success;

      return (
        <div
          className={`rounded-r-lg border-l-4 p-3 ${
            success ? "border-green-500 bg-green-900/20" : "border-red-500 bg-red-900/20"
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg">&#127922;</span>
            <span className={`font-bold ${success ? "text-green-400" : "text-red-400"}`}>
              {success ? "Success!" : "Failure!"}
            </span>
            <span className="text-sm text-gray-400">{res.characterName}</span>
          </div>
          <CheckRollDisplay roll={res.roll} dc={res.dc} />
        </div>
      );
    }

    case "server:combat_update":
      return null;

    default:
      return null;
  }
}
