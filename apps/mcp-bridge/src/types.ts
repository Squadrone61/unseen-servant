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
    /** Alignment string ("Lawful Good", etc.) — surfaced for opening narration. */
    alignment?: string;
    /**
     * Builder-supplied appearance fields. Only set ones that have values; omitted entirely if empty.
     * Source-of-truth for opening-scene physical description — never hallucinate around this.
     */
    appearance?: {
      gender?: string;
      age?: string;
      height?: string;
      weight?: string;
      hair?: string;
      eyes?: string;
      skin?: string;
    };
    /**
     * One-line first-person backstory hook — first non-blank line of static.backstory, truncated.
     * Useful for tying opening narration to what the player typed.
     */
    backstoryHook?: string;
    /**
     * Currently-equipped gear. Source-of-truth for "what is this PC visibly wearing/holding".
     * Only items with `equipped: true` are listed; unequipped inventory is omitted.
     * Never narrate a weapon, armor piece, or shield that isn't in this list.
     */
    equipped?: {
      weapons: string[]; // names of equipped weapons in inventory order
      armor?: string; // name of equipped armor (non-shield), if any
      shield?: string; // name of equipped shield, if any
      attunedItems?: string[]; // names of attuned items (any kind)
    };
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
