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
    <div className="flex min-h-screen flex-col">
      <TopBar items={[]} current="Characters">
        <Button size="sm" href="/characters/create">
          Create Character
        </Button>
        <Button variant="secondary" size="sm" href="/characters/import">
          Import
        </Button>
      </TopBar>

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-5xl">
          {characters.length === 0 ? (
            <div className="py-16 text-center">
              <div
                className="mb-2 text-lg text-gray-600"
                style={{ fontFamily: "var(--font-cinzel)" }}
              >
                No characters yet
              </div>
              <p className="text-sm text-gray-600">
                Create a character or import one from a file to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {characters.map((saved) => {
                const s = saved.character.static;
                const name = s.name || "Unnamed";
                const color = charColor(name);
                const isConfirming = confirmDelete === saved.id;

                return (
                  <div
                    key={saved.id}
                    className="group relative rounded-lg border border-gray-700/25 bg-gray-900/60 p-4 transition-colors hover:border-gray-700/40"
                  >
                    <Link href={`/characters/${saved.id}`} className="flex items-center gap-3">
                      <div
                        className={`h-10 w-10 shrink-0 rounded-md ${color.bg} border ${color.border} flex items-center justify-center`}
                      >
                        <span
                          className={`text-base ${color.text}`}
                          style={{ fontFamily: "var(--font-cinzel)" }}
                        >
                          {name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="truncate text-sm font-medium text-gray-300"
                            style={{ fontFamily: "var(--font-cinzel)" }}
                          >
                            {name}
                          </span>
                          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-400">
                            Lv {getTotalLevel(s.classes)}
                          </span>
                        </div>
                        <span className="truncate text-xs text-gray-600">
                          {s.species || s.race} · {formatClassString(s.classes)}
                        </span>
                        {saved.campaignSlug && (
                          <span className="w-fit truncate rounded border border-amber-500/10 bg-amber-500/5 px-1.5 py-0.5 text-xs text-amber-500/40">
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
                          className="text-gray-600 opacity-0 transition-colors group-hover:opacity-100 hover:text-red-400"
                          title="Delete character"
                        >
                          <svg
                            className="h-4 w-4"
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
