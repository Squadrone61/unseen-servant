import type { CharacterData } from "@unseen-servant/shared/types";
import { formatClassString, getTotalLevel } from "@unseen-servant/shared/utils";

interface CharacterTriggerProps {
  character: CharacterData;
  onClick: () => void;
  /** Compact mode shows only name + HP (used in combat layout) */
  compact?: boolean;
}

export function CharacterTrigger({ character, onClick, compact }: CharacterTriggerProps) {
  const hp = character.dynamic?.currentHP ?? character.static.maxHP;
  const maxHP = character.static.maxHP;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1 border border-gray-700/40 rounded
                 text-xs hover:border-gray-600/50 transition-colors shrink-0"
    >
      <span
        className="w-5 h-5 rounded bg-amber-500/10 border border-amber-500/20
                   flex items-center justify-center text-amber-400 text-xs"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        {character.static.name?.[0]?.toUpperCase()}
      </span>
      <span className="text-gray-300">{character.static.name}</span>
      {!compact && (
        <>
          <span className="text-gray-600">&middot;</span>
          <span className="text-gray-500">
            {formatClassString(character.static.classes)} {getTotalLevel(character.static.classes)}
          </span>
          <span className="text-gray-600">&middot;</span>
        </>
      )}
      <span className="text-green-500 flex items-center gap-1">
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        {hp}/{maxHP}
      </span>
      {!compact && (
        <svg
          className="w-3 h-3 text-gray-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      )}
    </button>
  );
}
