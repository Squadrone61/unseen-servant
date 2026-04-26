import type { CharacterData, EncounterBundle, GameState } from "@unseen-servant/shared/types";

/**
 * World state that fixtures provide. Each fixture .ts file exports a
 * `buildFixture()` returning this shape. The harness merges in the
 * scenario-supplied player message before writing the JSON the test bridge reads.
 */
export interface FixtureWorld {
  /** Map of playerName → CharacterData. */
  characters: Record<string, CharacterData>;
  /** Initial GameState (encounter/eventLog/pacing/encounterLength). Defaults applied if omitted. */
  gameState?: Partial<GameState>;
  /** Player names known to the bridge. Defaults to keys of characters. */
  playerNames?: string[];
  /** Host name. Defaults to first playerName. */
  hostName?: string;
  /** Whether the story has been started. Defaults true. */
  storyStarted?: boolean;
  /**
   * Campaign name to create at boot. When set, the test bridge calls
   * `campaignManager.createCampaign(campaignName)` so any subsequent campaign-tool
   * call (read_campaign_file, save_encounter_bundle, …) sees a live activeSlug.
   * Required if `bundles` is set.
   */
  campaignName?: string;
  /**
   * Encounter bundles to pre-save into the campaign before the conductor runs.
   * Each is written via `campaignManager.saveEncounterBundle` so the test bridge's
   * `load_encounter_bundle` tool can find them. Requires `campaignName`.
   */
  bundles?: EncounterBundle[];
}

/**
 * The shape that test-mcp-server reads at boot — fixture world plus the player message.
 */
export interface FixtureState extends FixtureWorld {
  playerMessage: {
    playerName: string;
    chat: string;
    userId?: string;
  };
}

/**
 * Frontmatter for a `.scenario.md` file. Authors write this; the runner consumes it.
 */
export interface ScenarioFrontmatter {
  /** Source files (under apps/dm-launcher/src/) to bundle into the temp workspace. */
  skills?: string[];
  rules?: string[];
  agents?: string[];
  /** Fixture name — resolves to apps/dm-launcher/test/fixtures/<fixture>.ts (no extension). */
  fixture: string;
  /** Player who sends the scenario's message. Must be present in fixture.characters. */
  player_name: string;
  /** The player's chat message that triggers the conductor's turn. */
  player_message: string;
  /** Override the conductor's model. Defaults to sonnet. */
  model?: string;
  /** Whether to load CLAUDE.md (the conductor core contract). Defaults true. */
  loadClaudeMd?: boolean;
  /** Hard timeout for the entire scenario (seconds). Defaults to 60. */
  timeoutSec?: number;
}

/**
 * Assertions block: machine-checkable expectations for one scenario.
 * Each field is optional; only specified ones are evaluated.
 */
export interface ScenarioAssertions {
  /** Tool names that MUST appear in the call log at least once. */
  must_call?: string[];
  /** Tool names that MUST NOT appear in the call log. */
  must_not_call?: string[];
  /**
   * Substrings or `/regex/i` patterns that MUST appear in at least one
   * send_response/send_narration broadcast. Case-insensitive substring match by default.
   */
  must_say?: string[];
  /** Same syntax — must NOT appear in any DM-facing output. */
  must_not_say?: string[];
  /** When true, the scenario must end with send_response or acknowledge. Defaults true. */
  must_close_turn?: boolean;
}

export interface Scenario {
  /** Filename without extension. */
  name: string;
  /** Absolute path to the scenario file. */
  filePath: string;
  frontmatter: ScenarioFrontmatter;
  /** Free-form prose describing the scenario's intent. */
  description: string;
  assertions: ScenarioAssertions;
}

/**
 * One tool invocation, written as JSONL by the test bridge.
 */
export interface ToolCallLog {
  ts: string;
  tool: string;
  args: unknown;
  /** First 2KB of the result payload, JSON-serialized. */
  result?: string;
  error?: string;
  durationMs: number;
}

/**
 * Broadcast events recorded by MockWSClient.send() — any client:broadcast payload
 * goes here so we can assert on what the conductor showed players.
 */
export interface BroadcastLog {
  ts: string;
  /** The ServerMessage type, e.g. "server:ai", "server:dice_roll". */
  type: string;
  payload: unknown;
}

export interface RunResult {
  scenario: string;
  passed: boolean;
  failures: string[];
  toolCalls: ToolCallLog[];
  broadcasts: BroadcastLog[];
  /** True iff send_response or acknowledge was called. */
  closedTurn: boolean;
  durationMs: number;
  /** Captured stderr from the test bridge (for debugging). */
  bridgeStderr?: string;
  /** Captured stdout from claude -p (the conductor's final assistant text). */
  conductorStdout?: string;
}
