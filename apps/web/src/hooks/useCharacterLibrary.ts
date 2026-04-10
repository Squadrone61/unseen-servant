"use client";

import { useState, useEffect, useCallback } from "react";
import type { CharacterData } from "@unseen-servant/shared/types";
import type { SavedCharacter } from "@/types/saved-character";

const STORAGE_KEY = "character_library";

function readLibrary(): SavedCharacter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLibrary(chars: SavedCharacter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
}

export function useCharacterLibrary() {
  const [characters, setCharacters] = useState<SavedCharacter[]>([]);

  // Load on mount
  useEffect(() => {
    setCharacters(readLibrary());
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setCharacters(readLibrary());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const sorted = [...characters].sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  const getCharacter = useCallback(
    (id: string): SavedCharacter | null => {
      return characters.find((c) => c.id === id) ?? null;
    },
    [characters],
  );

  const saveCharacter = useCallback(
    (
      char: CharacterData,
      opts?: {
        campaignSlug?: string;
        roomCode?: string;
        builderState?: SavedCharacter["builderState"];
      },
    ): SavedCharacter => {
      const now = Date.now();
      const saved: SavedCharacter = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        campaignSlug: opts?.campaignSlug,
        roomCode: opts?.roomCode,
        character: char,
        builderState: opts?.builderState,
      };
      const updated = [...readLibrary(), saved];
      writeLibrary(updated);
      setCharacters(updated);
      return saved;
    },
    [],
  );

  const updateCharacter = useCallback(
    (id: string, char: CharacterData, builderState?: SavedCharacter["builderState"]) => {
      const lib = readLibrary();
      const idx = lib.findIndex((c) => c.id === id);
      if (idx === -1) return;
      lib[idx] = {
        ...lib[idx],
        character: char,
        builderState,
        updatedAt: Date.now(),
      };
      writeLibrary(lib);
      setCharacters(lib);
    },
    [],
  );

  const deleteCharacter = useCallback((id: string) => {
    const lib = readLibrary().filter((c) => c.id !== id);
    writeLibrary(lib);
    setCharacters(lib);
  }, []);

  const touchCharacter = useCallback((id: string) => {
    const lib = readLibrary();
    const idx = lib.findIndex((c) => c.id === id);
    if (idx === -1) return;
    lib[idx] = { ...lib[idx], lastUsedAt: Date.now() };
    writeLibrary(lib);
    setCharacters(lib);
  }, []);

  const bindToCampaign = useCallback((id: string, campaignSlug: string, roomCode: string) => {
    const lib = readLibrary();
    const idx = lib.findIndex((c) => c.id === id);
    if (idx === -1) return;
    lib[idx] = { ...lib[idx], campaignSlug, roomCode };
    writeLibrary(lib);
    setCharacters(lib);
  }, []);

  const findByName = useCallback(
    (name: string): SavedCharacter | null => {
      return (
        characters.find((c) => c.character.static.name.toLowerCase() === name.toLowerCase()) ?? null
      );
    },
    [characters],
  );

  const findByCampaign = useCallback(
    (campaignSlug: string): SavedCharacter | null => {
      return characters.find((c) => c.campaignSlug === campaignSlug) ?? null;
    },
    [characters],
  );

  return {
    characters: sorted,
    getCharacter,
    saveCharacter,
    updateCharacter,
    deleteCharacter,
    touchCharacter,
    bindToCampaign,
    findByName,
    findByCampaign,
  };
}
