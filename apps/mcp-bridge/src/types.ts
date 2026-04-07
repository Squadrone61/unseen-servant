/** Bridge-specific types for the MCP ↔ Worker WebSocket link. */

import { z } from "zod";

export interface DMRequest {
  requestId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  totalMessageCount: number;
}

export interface PlayerSummary {
  name: string;
  online: boolean;
  isHost: boolean;
  character?: {
    name: string;
    race: string;
    classes: string;
    level: number;
    hp: string;
    ac: number;
    conditions: string[];
  };
}

// === Campaign types ===

export const campaignManifestSchema = z.object({
  name: z.string(),
  slug: z.string(),
  players: z.array(z.string()),
  sessionCount: z.number().int().min(0),
  createdAt: z.string(),
  lastPlayedAt: z.string(),
  pacingProfile: z.string().optional(),
  encounterLength: z.string().optional(),
});

export type CampaignManifest = z.infer<typeof campaignManifestSchema>;

export interface CampaignSummary {
  slug: string;
  name: string;
  lastPlayedAt: string;
  sessionCount: number;
  pacingProfile?: string;
  encounterLength?: string;
  customPrompt?: string;
}
