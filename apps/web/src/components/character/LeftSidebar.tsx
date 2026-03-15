"use client";

import { useState } from "react";
import type { CharacterData } from "@unseen-servant/shared/types";
import { formatClassString, getTotalLevel } from "@unseen-servant/shared/utils";
import { CharacterSheet } from "./CharacterSheet";
import { Button } from "@/components/ui/Button";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";

interface LeftSidebarProps {
  character: CharacterData | null;
  libraryId: string | null;
  onCharacterImported: (character: CharacterData, libraryId: string) => void;
  onOpenSettings: () => void;
}

export function LeftSidebar({ character, libraryId, onCharacterImported, onOpenSettings }: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { characters, touchCharacter } = useCharacterLibrary();

  if (collapsed) {
    return (
      <div className="w-10 bg-gray-800/60 border-r border-gray-700/40 flex flex-col items-center pt-3 shrink-0">
        <Button
          variant="icon"
          onClick={() => setCollapsed(false)}
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
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-800/60 border-r border-gray-700/40 flex flex-col shrink-0 relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/40 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="danger" size="xs" href="/">
            Quit
          </Button>
          <Button
            variant="icon"
            onClick={onOpenSettings}
            title="Settings"
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </Button>
          {character && libraryId && characters.find(c => c.id === libraryId && c.builderChoices) && (
            <Button
              variant="ghost"
              size="xs"
              href={`/characters/${libraryId}/edit`}
              target="_blank"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Update Character
            </Button>
          )}
        </div>
        <Button
          variant="icon"
          onClick={() => setCollapsed(true)}
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
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {character ? (
          <CharacterSheet character={character} />
        ) : (
          <CharacterPicker
            characters={characters}
            onSelect={(saved) => {
              touchCharacter(saved.id);
              onCharacterImported(saved.character, saved.id);
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
          <Button size="xs" href="/characters/create" target="_blank" fullWidth>
            Create Character
          </Button>
          <Button variant="secondary" size="xs" href="/characters/import" target="_blank" fullWidth>
            Import
          </Button>
        </div>
        <Button variant="ghost" size="xs" href="/characters" target="_blank">
          Manage Characters &rarr;
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto">
      <div className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>
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
            <div className="text-xs text-gray-400 truncate">
              {s.species || s.race} &middot; {formatClassString(s.classes)} &middot; Lvl{" "}
              {getTotalLevel(s.classes)}
            </div>
          </button>
        );
      })}
      <div className="pt-1">
        <Button variant="ghost" size="xs" href="/characters" target="_blank">
          Manage Characters &rarr;
        </Button>
      </div>
    </div>
  );
}
