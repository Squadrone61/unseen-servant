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
    warnings,
    error,
    fallbackHint,
    importFromUrl,
    importFromJson,
    clearCharacter,
  } = useCharacterImport();

  // On successful DDB import, save to library and redirect
  useEffect(() => {
    if (importState === "success" && character) {
      const saved = saveCharacter(character);
      router.push(`/characters/${saved.id}`);
    }
  }, [importState, character, saveCharacter, router]);

  const handleImportNative = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.format !== "aidnd") {
        throw new Error("Not a valid .aidnd.json file");
      }
      const saved = saveCharacter(data.character, {
        builderChoices: data.builderChoices ?? undefined,
      });
      router.push(`/characters/${saved.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to import file");
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="px-6 py-3">
        <Link href="/characters" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
          &larr; Back to Characters
        </Link>
      </div>

      <div className="w-full max-w-lg mx-auto pt-16">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-purple-400 mb-1">
            Import Character
          </h1>
          <p className="text-sm text-gray-500">
            Import from D&D Beyond or an .aidnd.json file.
          </p>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 space-y-4">
          <CharacterImport
            importState={importState}
            character={character}
            error={error}
            fallbackHint={fallbackHint}
            warnings={warnings}
            onImportUrl={importFromUrl}
            onImportJson={importFromJson}
            onImportNative={handleImportNative}
            onClear={clearCharacter}
          />
        </div>
      </div>
    </div>
  );
}
