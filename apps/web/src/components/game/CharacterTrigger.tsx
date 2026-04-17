import type { CharacterData } from "@unseen-servant/shared/types";
import { getHP } from "@unseen-servant/shared/character";

interface CharacterTriggerProps {
  character: CharacterData;
  onClick: () => void;
  /** Compact mode shows only name + HP (used in combat layout) */
  compact?: boolean;
}

export function CharacterTrigger({ character, onClick, compact }: CharacterTriggerProps) {
  const maxHP = getHP(character);
  const hp = character.dynamic?.currentHP ?? maxHP;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded border border-gray-700/40 px-2.5
                 py-1 text-xs transition-colors hover:border-gray-600/50"
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded
                   border border-amber-500/20 bg-amber-500/10 text-xs text-amber-400"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
        {character.static.name?.[0]?.toUpperCase()}
      </span>
      <span className="text-gray-300">{character.static.name}</span>
      {!compact && (
        <>
          <span className="text-gray-600">&middot;</span>
          <span className="text-gray-500">{character.static.species || character.static.race}</span>
          <span className="text-gray-600">&middot;</span>
        </>
      )}
      <span className="flex items-center gap-1 text-green-500">
        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        {hp}/{maxHP}
      </span>
      {!compact && (
        <svg
          className="h-3 w-3 text-gray-600"
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
