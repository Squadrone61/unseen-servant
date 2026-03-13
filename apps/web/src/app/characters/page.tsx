"use client";

import { useState } from "react";
import Link from "next/link";
import { useCharacterLibrary } from "@/hooks/useCharacterLibrary";
import { formatClassString, getTotalLevel } from "@aidnd/shared/utils";

export default function CharactersPage() {
  const { characters, deleteCharacter } = useCharacterLibrary();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold text-amber-200/90"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            My Characters
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {characters.length} character{characters.length !== 1 ? "s" : ""} in your library
          </p>
          <div className="h-px bg-gradient-to-r from-amber-500/30 via-gray-700/50 to-transparent mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/characters/builder"
            className="bg-amber-600/80 hover:bg-amber-500/80 text-amber-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Create Character
          </Link>
          <Link
            href="/characters/create"
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Import
          </Link>
          <Link
            href="/"
            className="text-sm text-amber-400/70 hover:text-amber-300 transition-colors px-2 py-2"
          >
            &larr; Home
          </Link>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-500 text-lg mb-2" style={{ fontFamily: "var(--font-cinzel)" }}>No characters yet</div>
          <p className="text-gray-500 text-sm mb-4">
            Create a character or import one from a file to get started.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/characters/builder"
              className="inline-block bg-amber-600/80 hover:bg-amber-500/80 text-amber-50 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Create Character
            </Link>
            <Link
              href="/characters/create"
              className="inline-block bg-gray-700 hover:bg-gray-600 text-gray-300 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Import
            </Link>
          </div>
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
                    <span className="text-[10px] bg-amber-500/10 text-amber-300 font-bold px-2 py-0.5 rounded-full">
                      Lvl {getTotalLevel(s.classes)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mb-3">
                    {s.race} &middot; {formatClassString(s.classes)}
                  </div>
                  {saved.campaignSlug && (
                    <div className="inline-block text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/50 rounded px-1.5 py-0.5 mb-2">
                      {saved.campaignSlug}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-600">
                    Last used{" "}
                    {new Date(saved.lastUsedAt).toLocaleDateString()}
                  </div>
                </Link>

                {/* Delete button */}
                <div className="absolute top-3 right-3">
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          deleteCharacter(saved.id);
                          setConfirmDelete(null);
                        }}
                        className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
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
