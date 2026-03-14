"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CharacterImport } from "@/components/character/CharacterImport";
import { useCharacterImport } from "@/hooks/useCharacterImport";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";

export default function CreateCharacterPage() {
  const router = useRouter();
  const { saveCharacter } = useCharacterLibrary();

  const {
    importState,
    character,
    error,
    importFromFile,
    clearCharacter,
  } = useCharacterImport();

  // On successful import, save to library and redirect
  useEffect(() => {
    if (importState === "success" && character) {
      const saved = saveCharacter(character);
      router.push(`/characters/${saved.id}`);
    }
  }, [importState, character, saveCharacter, router]);

  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="px-6 py-3">
        <Breadcrumb
          items={[{ label: "Home", href: "/" }, { label: "Characters", href: "/characters" }]}
          current="Import"
        />
      </div>

      <div className="w-full max-w-lg mx-auto pt-4">

        <div className="bg-gray-800/60 rounded-xl p-5 space-y-4 border border-gray-700/40">
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
  );
}
