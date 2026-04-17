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
    <div className="flex min-h-screen flex-col">
      <TopBar items={[{ label: "Characters", href: "/characters" }]} current="Import" />

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <div className="space-y-4 rounded-lg border border-gray-700/25 bg-gray-900/60 p-6">
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
