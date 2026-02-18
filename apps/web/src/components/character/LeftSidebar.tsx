"use client";

import { useState, useEffect } from "react";
import type { CharacterData } from "@aidnd/shared/types";
import { formatClassString, getTotalLevel } from "@aidnd/shared/utils";
import { CharacterSheet } from "./CharacterSheet";
import { CharacterImport } from "./CharacterImport";
import { HPBar } from "./HPBar";
import { useCharacterImport } from "@/hooks/useCharacterImport";

interface LeftSidebarProps {
  character: CharacterData | null;
  onCharacterImported: (character: CharacterData) => void;
}

type ImportMode = "closed" | "update" | "change";

export function LeftSidebar({ character, onCharacterImported }: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("closed");

  const {
    importState,
    character: importedCharacter,
    warnings,
    error: importError,
    fallbackHint,
    importFromUrl,
    importFromJson,
    clearCharacter,
    resetForReimport,
    setFreshImport,
  } = useCharacterImport({ existingCharacter: character });

  // When import succeeds, bubble up to GameContent and close import panel
  useEffect(() => {
    if (importedCharacter && importState === "success") {
      onCharacterImported(importedCharacter);
      setImportMode("closed");
    }
  }, [importedCharacter, importState, onCharacterImported]);

  if (collapsed) {
    return (
      <div className="w-10 bg-gray-800 border-r border-gray-700 flex flex-col items-center pt-3 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          title="Show character sheet"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    );
  }

  const panelOpen = importMode !== "closed";

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 relative">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 space-y-1.5 shrink-0">
        {/* Row 1: Name (or "Character") + buttons */}
        <div className="flex items-center justify-between">
          {character ? (
            <h2
              className="text-sm font-bold text-purple-400 truncate mr-2"
              title={character.static.name}
            >
              {character.static.name}
            </h2>
          ) : (
            <h2 className="text-sm font-medium text-gray-300">Character</h2>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {character && (
              <>
                <button
                  onClick={() => {
                    if (importMode === "update") {
                      setImportMode("closed");
                    } else {
                      setImportMode("update");
                      setFreshImport(false);
                      resetForReimport();
                    }
                  }}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    importMode === "update"
                      ? "bg-purple-600/20 text-purple-400"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="Re-import character after leveling up or making changes on D&D Beyond"
                >
                  Update
                </button>
                <button
                  onClick={() => {
                    if (importMode === "change") {
                      setImportMode("closed");
                      setFreshImport(false);
                    } else {
                      setImportMode("change");
                      setFreshImport(true);
                      resetForReimport();
                    }
                  }}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    importMode === "change"
                      ? "bg-purple-600/20 text-purple-400"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="Import a different character from scratch"
                >
                  Change
                </button>
              </>
            )}
            <button
              onClick={() => setCollapsed(true)}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              title="Collapse"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
        </div>
        {/* Row 2: Race · Class · Level */}
        {character && (
          <div className="text-[11px] text-gray-400 truncate">
            {character.static.race} &middot;{" "}
            {formatClassString(character.static.classes)} &middot; Lvl{" "}
            {getTotalLevel(character.static.classes)}
          </div>
        )}
        {/* Row 3: HP bar */}
        {character && (
          <HPBar
            current={character.dynamic.currentHP}
            max={character.static.maxHP}
            temp={character.dynamic.tempHP}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {character ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Import panel (shown when Update or Change is clicked) */}
            {panelOpen && (
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 mx-3 mt-3 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-400 font-medium">
                    {importMode === "change"
                      ? "Change Character"
                      : "Re-import Character"}
                  </div>
                  <button
                    onClick={() => {
                      setImportMode("closed");
                      setFreshImport(false);
                    }}
                    className="text-gray-600 hover:text-gray-400 transition-colors text-xs"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">
                  {importMode === "change"
                    ? "Import a new character. All current data will be replaced."
                    : "Leveled up or made changes on D&D Beyond? Re-import to update your stats. Your current HP, conditions, and spell slot usage will be preserved."}
                </p>
                <CharacterImport
                  importState={importState}
                  character={importedCharacter}
                  error={importError}
                  fallbackHint={fallbackHint}
                  warnings={warnings}
                  onImportUrl={importFromUrl}
                  onImportJson={importFromJson}
                  onClear={clearCharacter}
                />
              </div>
            )}

            <CharacterSheet character={character} />
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto p-3">
            <div className="text-center pt-4 pb-2">
              <div className="text-gray-400 text-sm font-medium mb-1">
                Import Character
              </div>
              <p className="text-gray-600 text-xs">
                Import from D&D Beyond to see your character sheet and share
                stats with the party.
              </p>
            </div>
            <CharacterImport
              importState={importState}
              character={importedCharacter}
              error={importError}
              fallbackHint={fallbackHint}
              warnings={warnings}
              onImportUrl={importFromUrl}
              onImportJson={importFromJson}
              onClear={clearCharacter}
            />
          </div>
        )}
      </div>
    </div>
  );
}
