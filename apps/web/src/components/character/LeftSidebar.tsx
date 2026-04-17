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
      <div className="space-y-3 p-4 text-center">
        <div className="text-sm text-gray-400" style={{ fontFamily: "var(--font-cinzel)" }}>
          No characters
        </div>
        <div className="mx-auto h-px w-12 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        <p className="text-xs text-gray-600">Create or import a character to get started.</p>
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
    <div className="space-y-2 overflow-y-auto p-3">
      <div
        className="mb-2 text-sm font-medium tracking-wider text-gray-500 uppercase"
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
            className="w-full rounded-lg border border-gray-700/40 bg-gray-900/50 p-2.5 text-left transition-colors hover:border-gray-600/60 hover:bg-gray-700/50"
          >
            <div
              className="truncate text-sm font-medium text-amber-300"
              style={{ fontFamily: "var(--font-cinzel)" }}
            >
              {s.name}
            </div>
            <div className="truncate text-xs text-gray-400">
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
