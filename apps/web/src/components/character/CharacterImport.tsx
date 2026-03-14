"use client";

import { useRef } from "react";
import type { CharacterData } from "@unseen-servant/shared/types";
import { formatClassString, getTotalLevel } from "@unseen-servant/shared/utils";

interface CharacterImportProps {
  importState: "idle" | "success" | "error";
  character: CharacterData | null;
  error: string;
  onImportFile: (json: string) => void;
  onClear: () => void;
}

export function CharacterImport({
  importState,
  character,
  error,
  onImportFile,
  onClear,
}: CharacterImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (importState === "success" && character) {
    const s = character.static;
    return (
      <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-amber-300">
              {s.name}
            </div>
            <div className="text-xs text-gray-400">
              {s.species || s.race} {formatClassString(s.classes)} (Lvl{" "}
              {getTotalLevel(s.classes)})
            </div>
          </div>
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 leading-relaxed">
        Import a character from a <code className="text-gray-400">.unseen.json</code> file exported from this app.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.unseen.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (evt) => {
            const json = evt.target?.result as string;
            if (json) onImportFile(json);
          };
          reader.readAsText(file);
          e.target.value = "";
        }}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full bg-amber-600/80 hover:bg-amber-500/80 text-amber-50 py-1.5 rounded-lg text-sm font-medium transition-colors"
      >
        Upload .unseen.json
      </button>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/10 rounded px-2 py-1.5">
          {error}
        </div>
      )}
    </div>
  );
}
