"use client";

import { useState, useCallback } from "react";
import type { CharacterData } from "@aidnd/shared/types";

type ImportState = "idle" | "success" | "error";

interface UseCharacterImportResult {
  importState: ImportState;
  character: CharacterData | null;
  error: string;
  importFromFile: (jsonString: string) => void;
  clearCharacter: () => void;
}

export function useCharacterImport(): UseCharacterImportResult {
  const [importState, setImportState] = useState<ImportState>("idle");
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [error, setError] = useState("");

  const importFromFile = useCallback((jsonString: string) => {
    setError("");
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed?.format !== "aidnd" || !parsed?.character) {
        setError("Not a valid .aidnd.json file.");
        setImportState("error");
        return;
      }
      setCharacter(parsed.character as CharacterData);
      setImportState("success");
    } catch {
      setError("Invalid JSON file.");
      setImportState("error");
    }
  }, []);

  const clearCharacter = useCallback(() => {
    setCharacter(null);
    setImportState("idle");
    setError("");
  }, []);

  return {
    importState,
    character,
    error,
    importFromFile,
    clearCharacter,
  };
}
