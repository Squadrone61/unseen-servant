import type { CharacterData } from "@unseen-servant/shared/types";

export interface SavedCharacter {
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  campaignSlug?: string;
  roomCode?: string;
  character: CharacterData;
}
