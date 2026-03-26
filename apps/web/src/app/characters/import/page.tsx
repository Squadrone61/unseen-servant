"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { TopBar } from "@/components/ui/TopBar";
import { CharacterImport } from "@/components/character/CharacterImport";
import { useCharacterImport } from "@/hooks/useCharacterImport";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";

export default function CreateCharacterPage() {
  const router = useRouter();
  const { saveCharacter } = useCharacterLibrary();

  const { importState, character, error, importFromFile, clearCharacter } = useCharacterImport();

  // On successful import, save to library and redirect
  useEffect(() => {
    if (importState === "success" && character) {
      const saved = saveCharacter(character);
      router.push(`/characters/${saved.id}`);
    }
  }, [importState, character, saveCharacter, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar items={[{ label: "Characters", href: "/characters" }]} current="Import" />

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <div className="bg-gray-900/60 rounded-lg p-6 space-y-4 border border-gray-700/25">
            <CharacterImport
              importState={importState}
              character={character}
              error={error}
              onImportFile={importFromFile}
              onClear={clearCharacter}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
