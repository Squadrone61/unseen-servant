"use client";

import { useState } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { formatClassString, getTotalLevel } from "@aidnd/shared/utils";

export default function CharactersPage() {
  const { characters, deleteCharacter } = useCharacterLibrary();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <Breadcrumb items={[{ label: "Home", href: "/" }]} current="Characters">
        <Button size="sm" href="/characters/create">
          Create Character
        </Button>
        <Button variant="secondary" size="sm" href="/characters/import">
          Import
        </Button>
      </Breadcrumb>

      {characters.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-500 text-lg mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>No characters yet</div>
          <p className="text-gray-500 text-sm">
            Create a character or import one from a file to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((saved) => {
            const s = saved.character.static;
            const isConfirming = confirmDelete === saved.id;

            return (
              <div
                key={saved.id}
                className={`bg-gray-800/60 border border-gray-700/40 rounded-lg p-4 hover:border-gray-600 hover:bg-gray-800 transition-all duration-200 group relative border-l-2 ${
                  ["border-l-amber-500/50", "border-l-blue-500/50", "border-l-green-500/50", "border-l-amber-500", "border-l-red-500/50", "border-l-cyan-500/50"][s.name.charCodeAt(0) % 6]
                }`}
              >
                <Link href={`/characters/${saved.id}`} className="block">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-bold text-amber-300 truncate" style={{ fontFamily: "var(--font-cinzel)" }}>
                      {s.name}
                    </h3>
                    <span className="text-xs bg-amber-500/10 text-amber-300 font-bold px-2 py-0.5 rounded-full">
                      Lvl {getTotalLevel(s.classes)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mb-3">
                    {s.race} &middot; {formatClassString(s.classes)}
                  </div>
                  {saved.campaignSlug && (
                    <div className="inline-block text-xs bg-amber-500/10 text-amber-300 border border-amber-500/50 rounded px-1.5 py-0.5 mb-2">
                      {saved.campaignSlug}
                    </div>
                  )}
                  <div className="text-xs text-gray-600">
                    Last used{" "}
                    {new Date(saved.lastUsedAt).toLocaleDateString()}
                  </div>
                </Link>

                {/* Delete button */}
                <div className="absolute top-3 right-3">
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => {
                          deleteCharacter(saved.id);
                          setConfirmDelete(null);
                        }}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(saved.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete character"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
  );
}
