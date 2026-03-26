"use client";

import { useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/ui/TopBar";
import { Button } from "@/components/ui/Button";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { formatClassString, getTotalLevel } from "@unseen-servant/shared/utils";
import { charColor } from "@/utils/char-color";

export default function CharactersPage() {
  const { characters, deleteCharacter } = useCharacterLibrary();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar items={[]} current="Characters">
        <Button size="sm" href="/characters/create">
          Create Character
        </Button>
        <Button variant="secondary" size="sm" href="/characters/import">
          Import
        </Button>
      </TopBar>

      <div className="flex-1 p-6">
        <div className="max-w-5xl mx-auto">
          {characters.length === 0 ? (
            <div className="text-center py-16">
              <div
                className="text-gray-600 text-lg mb-2"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                No characters yet
              </div>
              <p className="text-gray-600 text-sm">
                Create a character or import one from a file to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {characters.map((saved) => {
                const s = saved.character.static;
                const name = s.name || "Unnamed";
                const color = charColor(name);
                const isConfirming = confirmDelete === saved.id;

                return (
                  <div
                    key={saved.id}
                    className="bg-gray-900/60 border border-gray-700/25 rounded-lg p-4 hover:border-gray-700/40 transition-colors group relative"
                  >
                    <Link href={`/characters/${saved.id}`} className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 shrink-0 rounded-md ${color.bg} border ${color.border} flex items-center justify-center`}
                      >
                        <span
                          className={`text-base ${color.text}`}
                          style={{ fontFamily: "var(--font-cinzel)" }}
                        >
                          {name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-medium text-gray-300 truncate"
                            style={{ fontFamily: "var(--font-cinzel)" }}
                          >
                            {name}
                          </span>
                          <span className="text-xs bg-amber-500/10 text-amber-400 font-bold px-2 py-0.5 rounded-full shrink-0">
                            Lv {getTotalLevel(s.classes)}
                          </span>
                        </div>
                        <span className="text-xs text-gray-600 truncate">
                          {s.species || s.race} · {formatClassString(s.classes)}
                        </span>
                        {saved.campaignSlug && (
                          <span className="text-xs text-amber-500/40 bg-amber-500/5 border border-amber-500/10 rounded px-1.5 py-0.5 truncate w-fit">
                            {saved.campaignSlug}
                          </span>
                        )}
                        <span className="text-xs text-gray-700">
                          Last used {new Date(saved.lastUsedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>

                    {/* Delete button */}
                    <div className="absolute top-3 right-3">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              deleteCharacter(saved.id);
                              setConfirmDelete(null);
                            }}
                          >
                            Confirm
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(saved.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete character"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
