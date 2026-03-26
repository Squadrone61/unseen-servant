"use client";

import type { CharacterData } from "@unseen-servant/shared/types";
import { formatClassString, getTotalLevel } from "@unseen-servant/shared/utils";
import { CharacterSheet } from "./CharacterSheet";
import { Button } from "@/components/ui/Button";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";

interface LeftSidebarProps {
  character: CharacterData | null;
  onCharacterImported: (character: CharacterData, libraryId: string) => void;
}

export function LeftSidebar({ character, onCharacterImported }: LeftSidebarProps) {
  const { characters, touchCharacter } = useCharacterLibrary();

  if (character) {
    return <CharacterSheet character={character} />;
  }

  return (
    <CharacterPicker
      characters={characters}
      onSelect={(saved) => {
        touchCharacter(saved.id);
        onCharacterImported(saved.character, saved.id);
      }}
    />
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
        <div className="text-gray-400 text-sm" style={{ fontFamily: "var(--font-cinzel)" }}>
          No characters
        </div>
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent mx-auto" />
        <p className="text-gray-600 text-xs">Create or import a character to get started.</p>
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
      <div
        className="text-sm text-gray-500 uppercase tracking-wider font-medium mb-2"
        style={{ fontFamily: "var(--font-cinzel)" }}
      >
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
            <div
              className="text-sm font-medium text-amber-300 truncate"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
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
