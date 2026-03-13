"use client";

import { useState } from "react";
import type { CharacterData } from "@aidnd/shared/types";
import { formatClassString, getTotalLevel } from "@aidnd/shared/utils";
import { CharacterSheet } from "./CharacterSheet";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import Link from "next/link";

interface LeftSidebarProps {
  character: CharacterData | null;
  onCharacterImported: (character: CharacterData) => void;
}

export function LeftSidebar({ character, onCharacterImported }: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { characters, touchCharacter } = useCharacterLibrary();

  if (collapsed) {
    return (
      <div className="w-10 bg-gray-800/60 border-r border-gray-700/40 flex flex-col items-center pt-3 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          title="Show character sheet"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-800/60 border-r border-gray-700/40 flex flex-col shrink-0 relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/40 shrink-0">
        <Link
          href="/"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          &larr; Home
        </Link>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          title="Collapse"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {character ? (
          <div className="flex flex-col flex-1 min-h-0">
            <CharacterSheet character={character} />
            {/* Actions */}
            <div className="p-2 border-t border-gray-700/40 shrink-0 flex items-center justify-between">
              <Link
                href="/characters"
                target="_blank"
                className="text-[10px] text-gray-500 hover:text-amber-300 transition-colors"
              >
                View in library &rarr;
              </Link>
              {(() => {
                const saved = characters.find(c => c.character.static.name === character.static.name && c.builderChoices);
                if (!saved) return null;
                return (
                  <Link
                    href={`/characters/create?edit=${saved.id}`}
                    target="_blank"
                    className="text-[10px] text-amber-400/80 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 rounded px-2 py-0.5 transition-colors"
                  >
                    Update Character
                  </Link>
                );
              })()}
            </div>
          </div>
        ) : (
          <CharacterPicker
            characters={characters}
            onSelect={(saved) => {
              touchCharacter(saved.id);
              onCharacterImported(saved.character);
            }}
          />
        )}
      </div>
    </div>
  );
}

function CharacterPicker({
  characters,
  onSelect,
}: {
  characters: import("@/types/saved-character").SavedCharacter[];
  onSelect: (saved: import("@/types/saved-character").SavedCharacter) => void;
}) {
  if (characters.length === 0) {
    return (
      <div className="p-4 text-center space-y-3">
        <div className="text-gray-400 text-sm" style={{ fontFamily: "var(--font-cinzel)" }}>No characters</div>
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent mx-auto" />
        <p className="text-gray-600 text-xs">
          Create or import a character to get started.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/characters/builder"
            target="_blank"
            className="inline-block bg-amber-600/80 hover:bg-amber-500/80 text-amber-50 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            Create Character
          </Link>
          <Link
            href="/characters/create"
            target="_blank"
            className="inline-block bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/40 text-gray-300 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            Import
          </Link>
        </div>
        <Link
          href="/characters"
          target="_blank"
          className="text-xs text-gray-500 hover:text-amber-300 transition-colors"
        >
          Manage Characters &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>
        Select a character
      </div>
      {characters.map((saved) => {
        const s = saved.character.static;
        return (
          <button
            key={saved.id}
            onClick={() => onSelect(saved)}
            className="w-full text-left bg-gray-900/50 hover:bg-gray-700/50 border border-gray-700/40 hover:border-gray-600/60 rounded-lg p-2.5 transition-colors"
          >
            <div className="text-sm font-medium text-amber-300 truncate" style={{ fontFamily: "var(--font-cinzel)" }}>
              {s.name}
            </div>
            <div className="text-[11px] text-gray-400 truncate">
              {s.species || s.race} &middot; {formatClassString(s.classes)} &middot; Lvl{" "}
              {getTotalLevel(s.classes)}
            </div>
          </button>
        );
      })}
      <div className="pt-1">
        <Link
          href="/characters"
          target="_blank"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Manage Characters &rarr;
        </Link>
      </div>
    </div>
  );
}
