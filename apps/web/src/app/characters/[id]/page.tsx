"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
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
      format: "unseen",
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
    a.download = `${character.static.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.unseen.json`;
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
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
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
      {/* Toolbar */}
      <div className="bg-gray-800/60 border-b border-gray-700/40 px-6 py-3 shrink-0">
        <div className="max-w-4xl mx-auto">
          <Breadcrumb
            items={[{ label: "Home", href: "/" }, { label: "Characters", href: "/characters" }]}
            current={char.static.name}
          >
            {saved.builderChoices && (
              <Button
                size="sm"
                href={`/characters/${saved.id}/edit`}
              >
                Edit
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportNative(char)}
            >
              Export
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </Breadcrumb>
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
