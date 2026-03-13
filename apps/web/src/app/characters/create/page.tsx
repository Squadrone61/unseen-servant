"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
        <Link href="/characters" className="text-sm text-amber-400/70 hover:text-amber-300 transition-colors">
          &larr; Back to Characters
        </Link>
      </div>

      <div className="w-full max-w-lg mx-auto pt-16">
        <div className="mb-6">
          <h1
            className="text-2xl font-bold text-amber-200/90 mb-1"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            Import Character
          </h1>
          <p className="text-xs text-gray-500">
            Import a character from an .aidnd.json file.
          </p>
          <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
        </div>

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
