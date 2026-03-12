"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";


export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getCharacter, deleteCharacter } = useCharacterLibrary();

  const saved = getCharacter(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportNative = (character: typeof char) => {
    const data = {
      format: "aidnd",
      version: 1,
      exportedAt: new Date().toISOString(),
      character: character,
      builderChoices: saved?.builderChoices ?? undefined,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${character.static.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.aidnd.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!saved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="text-gray-400 text-lg">Character not found</div>
          <Link
            href="/characters"
            className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            Back to Characters
          </Link>
        </div>
      </div>
    );
  }

  const char = saved.character;

  const handleDelete = () => {
    deleteCharacter(saved.id);
    router.push("/characters");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Slim toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/characters"
            className="text-sm px-4 py-2 text-gray-500 hover:text-gray-300 transition-colors"
          >
            &larr; All Characters
          </Link>
          <span className="text-sm font-medium text-gray-300 truncate">{char.static.name}</span>
          <div className="flex items-center gap-2">
            {saved.builderChoices && (
              <Link
                href={`/characters/builder?edit=${saved.id}`}
                className="text-sm px-4 py-2 rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors"
              >
                Edit
              </Link>
            )}
            <button
              onClick={() => exportNative(char)}
              className="text-sm px-4 py-2 rounded bg-gray-700 text-gray-300 hover:bg-emerald-600 transition-colors"
            >
              Export
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  className="text-sm px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm px-3 py-2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm px-4 py-2 rounded bg-gray-700 text-gray-400 hover:bg-red-900/50 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Character sheet */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-4 px-6">
          <CharacterSheet character={char} />
        </div>
      </div>
    </div>
  );
}
