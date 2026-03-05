/** Bridge-specific types for the MCP ↔ Worker WebSocket link. */

export interface DMRequest {
  requestId: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
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

export interface CampaignManifest {
  name: string;
  slug: string;
  players: string[];
  sessionCount: number;
  partyLevel: number;
  createdAt: string;
  lastPlayedAt: string;
}

export interface CampaignSummary {
  slug: string;
  name: string;
  lastPlayedAt: string;
  sessionCount: number;
}

