import type { CharacterData } from "@unseen-servant/shared/types";
import type { BuilderChoices } from "@/components/builder/types";

export interface SavedCharacter {
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  campaignSlug?: string;
  roomCode?: string;
  character: CharacterData;
  builderChoices?: BuilderChoices;
}
