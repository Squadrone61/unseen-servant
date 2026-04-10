import type { CharacterData } from "@unseen-servant/shared/types";
import type { BuilderState } from "@/app/characters/create/builder-state";

export interface SavedCharacter {
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  campaignSlug?: string;
  roomCode?: string;
  character: CharacterData;
  /** Original builder state for lossless edit round-trips. Absent for imported characters. */
  builderState?: BuilderState;
}
