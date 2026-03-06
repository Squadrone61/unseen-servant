import type { RollResult } from "@aidnd/shared/types";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DisplayMessage } from "./ChatPanel";
import { useTTS } from "../../hooks/useTTS";

interface ChatMessageProps {
  message: DisplayMessage;
  onRollDice?: (checkRequestId: string) => void;
  myCharacterName?: string;
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-purple-300 mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold text-purple-300 mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-bold text-purple-300 mt-2 mb-0.5">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-bold text-purple-300 mt-1.5 mb-0.5">{children}</h4>,
  p: ({ children }) => <p className="text-gray-200 mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-gray-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
  ul: ({ children }) => <ul className="list-disc list-inside ml-2 mb-2 space-y-0.5 text-gray-200">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside ml-2 mb-2 space-y-0.5 text-gray-200">{children}</ol>,
  li: ({ children }) => <li className="text-gray-200">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-purple-400/50 pl-3 my-2 italic text-gray-300">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block bg-gray-800 rounded p-2 my-2 text-sm font-mono text-gray-200 overflow-x-auto">
          {children}
        </code>
      );
    }
    return <code className="bg-gray-800 rounded px-1 py-0.5 text-sm font-mono text-purple-300">{children}</code>;
  },
  pre: ({ children }) => <pre className="my-1">{children}</pre>,
  a: ({ href, children }) => (
    <a href={href} className="text-purple-400 underline hover:text-purple-300" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  hr: () => <hr className="border-gray-700 my-3" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm text-gray-200">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-700 px-2 py-1 bg-gray-800 font-semibold text-left">{children}</th>,
  td: ({ children }) => <td className="border border-gray-700 px-2 py-1">{children}</td>,
};

function TTSButton({ text }: { text: string }) {
  const { speak, stop, isSpeaking } = useTTS();

  return (
    <button
      onClick={() => (isSpeaking ? stop() : speak(text))}
      className="shrink-0 p-1 rounded hover:bg-purple-800/40 text-purple-400 hover:text-purple-300 transition-colors"
      title={isSpeaking ? "Stop narration" : "Listen to narration"}
      aria-label={isSpeaking ? "Stop narration" : "Listen to narration"}
    >
      {isSpeaking ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10 3.75a.75.75 0 00-1.264-.546L4.703 7H3.167a.75.75 0 00-.7.48A6.985 6.985 0 002 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h1.535l4.033 3.796A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
          <path d="M13.829 7.172a.75.75 0 00-1.061 1.06 2.5 2.5 0 010 3.536.75.75 0 001.06 1.06 4 4 0 000-5.656z" />
        </svg>
      )}
    </button>
  );
}

/** Renders individual die results as small badges: d20 [15] */
function DieBadges({ roll }: { roll: RollResult }) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {roll.rolls.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          <span className="text-gray-500 text-[10px]">d{r.die}</span>
          <span className="bg-gray-700/80 text-gray-200 text-xs font-mono font-semibold px-1.5 py-0.5 rounded">
            {r.result}
          </span>
        </span>
      ))}
      {roll.modifier !== 0 && (
        <span className="text-gray-400 text-xs font-mono">
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
    <div className="flex items-center gap-1.5 flex-wrap">
      <DieBadges roll={roll} />
      <span className="text-gray-500">=</span>
      <span className={`text-sm font-bold ${totalColor}`}>{roll.total}</span>
      {dc !== undefined && (
        <span className="text-gray-500 text-xs">vs DC {dc}</span>
      )}
    </div>
  );
}

/** Damage roll display: d6 [4] d6 [2] +3 = 9 */
function DamageRollDisplay({ roll }: { roll: RollResult }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <DieBadges roll={roll} />
      <span className="text-gray-500">=</span>
      <span className="text-sm font-bold text-orange-300">{roll.total}</span>
      <span className="text-gray-500 text-xs">damage</span>
    </div>
  );
}

/** Result badge pill */
function ResultBadge({ success, isCrit, isFail, pending }: {
  success?: boolean;
  isCrit?: boolean;
  isFail?: boolean;
  pending?: boolean;
}) {
  if (pending) {
    return (
      <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-gray-600/50 text-gray-400 animate-pulse">
        Resolving...
      </span>
    );
  }

  if (isCrit) {
    return (
      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
        Critical!
      </span>
    );
  }

  if (isFail) {
    return (
      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
        Critical Fail!
      </span>
    );
  }

  return success ? (
    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
      Success
    </span>
  ) : (
    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
      Failure
    </span>
  );
}

/** Consolidated check card — used for merged_check, merged_check_pending, and bare check_request */
function CheckCard({ message, onRollDice, myCharacterName }: {
  message: DisplayMessage;
  onRollDice?: (checkRequestId: string) => void;
  myCharacterName?: string;
}) {
  // Extract fields depending on message type
  const isMerged = message.type === "merged_check";
  const isPending = message.type === "merged_check_pending";
  const isBare = message.type === "server:check_request";

  const request = isMerged ? message.request
    : isPending ? message.request
    : isBare ? message.check
    : null;

  if (!request) return null;

  const roll = isMerged ? message.roll : isPending ? message.roll : null;
  const result = isMerged ? message.result : null;
  const isDamage = request.type === "damage";
  const checkLabel = request.skill || request.ability || request.type.replace("_", " ");

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
      // Pending — neutral
      borderColor = "border-blue-500";
      bgColor = "bg-blue-900/20";
    }
  }

  const isMyCheck = myCharacterName &&
    request.targetCharacter.toLowerCase() === myCharacterName.toLowerCase();

  return (
    <div className={`border-l-4 p-3 rounded-r-lg ${bgColor} ${borderColor}`}>
      {/* Header: check type + DC badge + result badge */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">&#127922;</span>
          <span className="text-sm font-semibold text-gray-200">
            {isDamage ? "Damage Roll" : checkLabel}
          </span>
          {!isDamage && request.dc !== undefined && (
            <span className="text-[11px] font-mono bg-gray-700/60 text-gray-300 px-1.5 py-0.5 rounded">
              DC {request.dc}
            </span>
          )}
        </div>
        {(isMerged || isPending) && !isDamage && (success !== undefined || isCrit || isFail || isPending) && (
          <ResultBadge
            success={success}
            isCrit={isCrit}
            isFail={isFail}
            pending={isPending}
          />
        )}
      </div>

      {/* Subtext: character name + reason */}
      <div className="text-xs text-gray-400 mb-1.5">
        <span className="text-gray-300">{request.targetCharacter}</span>
        {" — "}
        {request.reason}
      </div>

      {/* Advantage/disadvantage */}
      {(request.advantage || request.disadvantage) && (
        <div className="mb-1.5">
          {request.advantage && (
            <span className="text-[11px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded mr-1">Advantage</span>
          )}
          {request.disadvantage && (
            <span className="text-[11px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded mr-1">Disadvantage</span>
          )}
        </div>
      )}

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

      {/* Roll button for bare check_request */}
      {isBare && isMyCheck && onRollDice && (
        <button
          onClick={() => onRollDice(request.id)}
          className="mt-2 bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-1.5
                     rounded-lg font-medium transition-colors"
        >
          {isDamage ? `Roll Damage${request.notation ? ` (${request.notation})` : ""}` : "Roll d20"}
        </button>
      )}
    </div>
  );
}

export function ChatMessage({ message, onRollDice, myCharacterName }: ChatMessageProps) {
  switch (message.type) {
    case "server:chat":
      return (
        <div className="flex gap-2">
          <span className="font-bold text-blue-400 shrink-0">
            {message.playerName}:
          </span>
          <span className="text-gray-200">{message.content}</span>
        </div>
      );

    case "server:ai":
      return (
        <div className="bg-purple-900/20 border-l-4 border-purple-500 p-3 rounded-r-lg">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-purple-400 font-semibold">
              Dungeon Master
            </div>
            <TTSButton text={message.content} />
          </div>
          <div className="text-gray-200 leading-relaxed prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      );

    case "server:system":
      return (
        <div className="text-center text-sm text-gray-500 italic py-1">
          {message.content}
        </div>
      );

    case "server:error":
      return (
        <div className="text-center text-sm text-red-400 bg-red-900/20 p-2 rounded">
          Error: {message.message}
        </div>
      );

    // All check-related messages use the consolidated CheckCard
    case "server:check_request":
    case "merged_check":
    case "merged_check_pending":
      return <CheckCard message={message} onRollDice={onRollDice} myCharacterName={myCharacterName} />;

    // Standalone dice_roll (DM rolls not tied to checks, or unlinked legacy rolls)
    case "server:dice_roll": {
      // If this has a checkRequestId, it should have been consumed by merge — but render standalone as fallback
      const roll = message.roll;
      const isCrit = roll.criticalHit;
      const isFail = roll.criticalFail;

      return (
        <div
          className={`border-l-4 p-3 rounded-r-lg ${
            isCrit
              ? "bg-yellow-900/20 border-yellow-400"
              : isFail
                ? "bg-red-900/20 border-red-500"
                : "bg-blue-900/20 border-blue-500"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">&#127922;</span>
            <span className="text-xs font-semibold uppercase text-gray-400">
              {message.playerName} rolled
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <DieBadges roll={roll} />
            <span className="text-gray-500">=</span>
            <span
              className={`text-xl font-bold ${
                isCrit
                  ? "text-yellow-400"
                  : isFail
                    ? "text-red-400"
                    : "text-blue-300"
              }`}
            >
              {roll.total}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{roll.label}</div>
          {isCrit && (
            <div className="text-xs text-yellow-400 font-bold mt-1">
              CRITICAL HIT!
            </div>
          )}
          {isFail && (
            <div className="text-xs text-red-400 font-bold mt-1">
              CRITICAL FAIL!
            </div>
          )}
          {roll.advantage && (
            <span className="text-xs text-green-400">Advantage</span>
          )}
          {roll.disadvantage && (
            <span className="text-xs text-red-400">Disadvantage</span>
          )}
        </div>
      );
    }

    // Standalone check_result (shouldn't appear if merge works, but keep as fallback)
    case "server:check_result": {
      const res = message.result;
      const success = res.success;

      return (
        <div
          className={`border-l-4 p-3 rounded-r-lg ${
            success
              ? "bg-green-900/20 border-green-500"
              : "bg-red-900/20 border-red-500"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`text-lg font-bold ${
                success ? "text-green-400" : "text-red-400"
              }`}
            >
              {success ? "Success!" : "Failure!"}
            </span>
            <span className="text-sm text-gray-400">
              {res.characterName} rolled {res.roll.total}
              {res.dc !== undefined && ` vs DC ${res.dc}`}
            </span>
          </div>
        </div>
      );
    }

    case "server:combat_update":
      return null;

    default:
      return null;
  }
}
