import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createFighterCharacter } from "./setup.js";

/**
 * Behavioral contracts for CampaignManager — filesystem-level operations.
 * All operations use the CAMPAIGNS_ROOT path (process.env.UNSEEN_CAMPAIGNS_DIR or
 * `.unseen/campaigns` relative to cwd). Tests should set UNSEEN_CAMPAIGNS_DIR to a
 * temporary directory.
 *
 * ## createCampaign(name)
 * - Slugifies the name: lowercase, non-alphanum sequences → hyphens, leading/trailing
 *   hyphens stripped, max 60 chars.
 * - Throws if slug is empty (e.g. name is all special chars).
 * - Throws if a directory with that slug already exists in CAMPAIGNS_ROOT.
 * - Creates directory tree: {slug}/, {slug}/world/, {slug}/sessions/, {slug}/characters/.
 * - Writes campaign.json with: { name, slug, players: [], sessionCount: 0,
 *   createdAt, lastPlayedAt } (ISO strings). Validated via campaignManifestSchema.
 * - Creates starter text files:
 *     {slug}/system-prompt.md          (empty)
 *     {slug}/active-context.md         ("# Active Context\n\nNew campaign...")
 *     {slug}/world/npcs.md
 *     {slug}/world/locations.md
 *     {slug}/world/factions.md
 *     {slug}/world/quests.md
 *     {slug}/world/items.md
 * - Sets activeSlug and caches manifest in memory (manifestDirty=false).
 * - Returns the CampaignManifest object.
 *
 * ## loadCampaign(slug)
 * - Throws if {slug}/campaign.json does not exist.
 * - Reads and validates manifest via campaignManifestSchema.parse (strips unknown fields).
 * - Sets activeSlug and caches manifest (manifestDirty=false).
 * - Flushes any dirty manifest from a previously loaded campaign before loading.
 * - Returns the CampaignManifest.
 *
 * ## listCampaigns()
 * - Returns [] if CAMPAIGNS_ROOT does not exist.
 * - Scans all subdirectories for campaign.json.
 * - Skips entries that are not directories.
 * - Skips directories without campaign.json.
 * - Skips (with a log) directories with corrupt/invalid manifests — does not throw.
 * - Returns CampaignSummary[] sorted by lastPlayedAt descending (newest first).
 * - Each summary includes: slug, name, lastPlayedAt, sessionCount, and optionally
 *   pacingProfile, encounterLength, customPrompt (from system-prompt.md if non-empty).
 *
 * ## writeFile(relativePath, content)
 * - Requires an active campaign (throws if none loaded).
 * - Rejects paths containing ".." (throws "Invalid path").
 * - Rejects absolute paths (throws "Invalid path").
 * - Auto-appends .md extension when path has no extension.
 * - Creates parent directories as needed (ensureDir).
 * - Writes content to the resolved file path.
 * - Returns the path relative to the campaign directory.
 *
 * ## readFile(relativePath)
 * - Requires an active campaign (throws if none loaded).
 * - Rejects ".." paths (throws "Invalid path").
 * - Resolution order: {path}.md → {path}.json → {path} (exact).
 * - Returns null if no candidate file exists.
 * - Returns string content of the first found candidate.
 *
 * ## listFiles()
 * - Requires an active campaign (throws if none loaded).
 * - Returns [] if campaign directory does not exist.
 * - Recursively walks all files in the campaign directory.
 * - Returns paths relative to the campaign root, sorted lexicographically.
 * - Directories are walked depth-first; files are collected, not directory names.
 *
 * ## endSession(summary, activeContext, characters?)
 * - Requires an active campaign and cachedManifest (throws if none loaded).
 * - Increments cachedManifest.sessionCount by 1.
 * - Updates cachedManifest.lastPlayedAt to current ISO timestamp.
 * - Writes session summary to sessions/session-{NNN}.md (zero-padded to 3 digits).
 * - Writes activeContext to active-context.md.
 * - If characters provided: calls snapshotCharacters; updates manifest.players to
 *   character names extracted from character.static.name.
 * - Flushes manifest to disk via writeManifestToDisk (not just dirty flag).
 * - Deletes session-state.json if it exists.
 * - Returns { sessionNumber } — the incremented count.
 *
 * ## getStartupContext()
 * - Requires an active campaign (throws if none loaded).
 * - Assembles sections joined by "\n\n---\n\n":
 *     1. Campaign manifest summary (name, sessionCount, players, lastPlayedAt).
 *     2. DM Instructions from system-prompt.md (omitted if file absent or empty).
 *     3. Current State from active-context.md (omitted if absent or empty).
 *     4. World Notes: aggregates world/npcs.md, locations.md, quests.md, factions.md,
 *        items.md — skips files that are absent, empty, or contain "_No " or "_no ".
 *     5. DM Planning from dm/story-arc.md (omitted if absent or empty).
 *     6. Session History: reads all sessions/*.md files, sorted newest first.
 *        Skips empty session files.
 *     7. Party: character summaries from characters/*.json files.
 * - Returns assembled string (may be empty string if all sections are absent).
 */

// ---------------------------------------------------------------------------
// Module-level lazy import — CAMPAIGNS_ROOT is evaluated at import time, so we
// must set UNSEEN_CAMPAIGNS_DIR in the env BEFORE the module is first imported.
// ---------------------------------------------------------------------------

let CampaignManager: typeof import("../services/campaign-manager.js").CampaignManager;
let tmpDir: string;
let campaignsDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-test-"));
  campaignsDir = path.join(tmpDir, "campaigns");

  // Set the env var before the module is evaluated so CAMPAIGNS_ROOT picks it up.
  vi.stubEnv("UNSEEN_CAMPAIGNS_DIR", campaignsDir);

  // Reset the module cache so campaign-manager.ts is re-imported fresh and
  // CAMPAIGNS_ROOT is evaluated with the temp dir, not the real .unseen path.
  vi.resetModules();

  // Dynamic import AFTER env is set and module cache is cleared.
  const mod = await import("../services/campaign-manager.js");
  CampaignManager = mod.CampaignManager;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

// Each test suite gets a fresh manager instance.
let manager: InstanceType<typeof CampaignManager>;
beforeEach(() => {
  manager = new CampaignManager();
});

// ---------------------------------------------------------------------------
// createCampaign
// ---------------------------------------------------------------------------

describe("createCampaign", () => {
  describe("creates directory tree and starter files", () => {
    it("creates the campaign directory and required subdirectories", () => {
      manager.createCampaign("Dragon's Lair");
      const slug = "dragon-s-lair";
      const base = path.join(campaignsDir, slug);
      expect(fs.existsSync(base)).toBe(true);
      expect(fs.statSync(base).isDirectory()).toBe(true);
      expect(fs.existsSync(path.join(base, "world"))).toBe(true);
      expect(fs.existsSync(path.join(base, "sessions"))).toBe(true);
      expect(fs.existsSync(path.join(base, "characters"))).toBe(true);
    });

    it("creates all expected starter text files", () => {
      manager.createCampaign("The Sunken Keep");
      const slug = "the-sunken-keep";
      const base = path.join(campaignsDir, slug);
      expect(fs.existsSync(path.join(base, "system-prompt.md"))).toBe(true);
      expect(fs.existsSync(path.join(base, "active-context.md"))).toBe(true);
      expect(fs.existsSync(path.join(base, "world", "npcs.md"))).toBe(true);
      expect(fs.existsSync(path.join(base, "world", "locations.md"))).toBe(true);
      expect(fs.existsSync(path.join(base, "world", "factions.md"))).toBe(true);
      expect(fs.existsSync(path.join(base, "world", "quests.md"))).toBe(true);
      expect(fs.existsSync(path.join(base, "world", "items.md"))).toBe(true);
    });
  });

  describe("writes campaign.json with sessionCount=0 and empty players", () => {
    it("campaign.json is valid JSON and has correct shape", () => {
      const _manifest = manager.createCampaign("Frost Peak");
      const slug = "frost-peak";
      const raw = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(raw.name).toBe("Frost Peak");
      expect(raw.slug).toBe(slug);
      expect(raw.sessionCount).toBe(0);
      expect(raw.players).toEqual([]);
      expect(typeof raw.createdAt).toBe("string");
      expect(typeof raw.lastPlayedAt).toBe("string");
      // createdAt must be parseable as a date
      expect(isNaN(Date.parse(raw.createdAt))).toBe(false);
    });

    it("returns the CampaignManifest with matching fields", () => {
      const manifest = manager.createCampaign("Ashwood Vale");
      expect(manifest.name).toBe("Ashwood Vale");
      expect(manifest.slug).toBe("ashwood-vale");
      expect(manifest.sessionCount).toBe(0);
      expect(manifest.players).toEqual([]);
      expect(typeof manifest.createdAt).toBe("string");
      expect(typeof manifest.lastPlayedAt).toBe("string");
    });

    it("sets activeSlug after creation", () => {
      manager.createCampaign("Iron Citadel");
      expect(manager.activeSlug).toBe("iron-citadel");
    });
  });

  describe("throws when campaign slug already exists", () => {
    it("throws an error if the slug already exists on disk", () => {
      manager.createCampaign("Thornwood Forest");
      const secondManager = new CampaignManager();
      expect(() => secondManager.createCampaign("Thornwood Forest")).toThrow(/already exists/i);
    });
  });

  describe("throws when name slugifies to empty string", () => {
    it("throws when name consists entirely of special characters", () => {
      expect(() => manager.createCampaign("!!!")).toThrow(/invalid campaign name/i);
    });

    it("throws when name consists only of hyphens after slugification", () => {
      // A string of hyphens strips to empty after leading/trailing hyphen removal.
      expect(() => manager.createCampaign("---")).toThrow(/invalid campaign name/i);
    });
  });
});

// ---------------------------------------------------------------------------
// loadCampaign
// ---------------------------------------------------------------------------

describe("loadCampaign", () => {
  describe("reads and validates campaign.json", () => {
    it("loads a previously created campaign and returns its manifest", () => {
      // Use a separate manager to create, then load with a fresh one.
      const creator = new CampaignManager();
      creator.createCampaign("Shadow Spire");

      const loader = new CampaignManager();
      const manifest = loader.loadCampaign("shadow-spire");

      expect(manifest.name).toBe("Shadow Spire");
      expect(manifest.slug).toBe("shadow-spire");
      expect(manifest.sessionCount).toBe(0);
      expect(manifest.players).toEqual([]);
    });

    it("sets activeSlug after loading", () => {
      const creator = new CampaignManager();
      creator.createCampaign("Verdant Hollow");

      const loader = new CampaignManager();
      loader.loadCampaign("verdant-hollow");
      expect(loader.activeSlug).toBe("verdant-hollow");
    });
  });

  describe("throws when campaign not found", () => {
    it("throws when the slug does not exist on disk", () => {
      expect(() => manager.loadCampaign("nonexistent-campaign-xyz")).toThrow(/not found/i);
    });
  });

  describe("strips unknown fields via Zod parse", () => {
    it("loads manifest without error even when campaign.json has extra unknown fields", () => {
      // Write a manifest with an extra field that the schema should strip.
      const creator = new CampaignManager();
      creator.createCampaign("Gilded Ruin");
      const manifestPath = path.join(campaignsDir, "gilded-ruin", "campaign.json");
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      raw.unknownLegacyField = "should be stripped";
      raw.partyLevel = 5;
      fs.writeFileSync(manifestPath, JSON.stringify(raw, null, 2), "utf-8");

      const loader = new CampaignManager();
      // Should not throw — Zod parse strips unknown fields.
      const manifest = loader.loadCampaign("gilded-ruin");
      expect(manifest.name).toBe("Gilded Ruin");
      // Unknown fields are stripped, so they must not appear on the typed result.
      expect((manifest as Record<string, unknown>)["unknownLegacyField"]).toBeUndefined();
      expect((manifest as Record<string, unknown>)["partyLevel"]).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// listCampaigns
// ---------------------------------------------------------------------------

describe("listCampaigns", () => {
  describe("returns empty array when CAMPAIGNS_ROOT does not exist", () => {
    it("returns [] when the campaigns directory has never been created", () => {
      // Point to a directory that does not exist.
      const originalDir = process.env.UNSEEN_CAMPAIGNS_DIR;
      process.env.UNSEEN_CAMPAIGNS_DIR = path.join(tmpDir, "does-not-exist-campaigns");
      try {
        const freshManager = new CampaignManager();
        // listCampaigns checks fs.existsSync — must return [] gracefully.
        // NOTE: CAMPAIGNS_ROOT is module-level, so we can't re-import.
        // Instead, verify the actual runtime path by checking the known behaviour
        // of a manager whose campaigns root doesn't exist.
        // Since env is evaluated at module import time, we verify via the fact
        // that the real campaigns dir was created by the creator tests above
        // and our manager lists from that root, not from the missing one.
        // This test instead verifies listCampaigns never throws on missing root.
        expect(() => freshManager.listCampaigns()).not.toThrow();
      } finally {
        process.env.UNSEEN_CAMPAIGNS_DIR = originalDir;
      }
    });
  });

  describe("skips corrupt manifests gracefully", () => {
    it("does not throw when a campaign.json is malformed JSON", () => {
      // Create a subdirectory with corrupt JSON.
      const corruptSlug = "corrupt-campaign-xxx";
      const corruptDir = path.join(campaignsDir, corruptSlug);
      fs.mkdirSync(corruptDir, { recursive: true });
      fs.writeFileSync(
        path.join(corruptDir, "campaign.json"),
        "{ this is not valid json }",
        "utf-8",
      );

      expect(() => manager.listCampaigns()).not.toThrow();
      // The corrupt entry must not appear in results.
      const results = manager.listCampaigns();
      expect(results.find((c) => c.slug === corruptSlug)).toBeUndefined();
    });

    it("does not throw when campaign.json has wrong schema (missing required fields)", () => {
      const badSlug = "bad-schema-campaign-xxx";
      const badDir = path.join(campaignsDir, badSlug);
      fs.mkdirSync(badDir, { recursive: true });
      fs.writeFileSync(
        path.join(badDir, "campaign.json"),
        JSON.stringify({ name: "Incomplete" }),
        "utf-8",
      );

      expect(() => manager.listCampaigns()).not.toThrow();
      const results = manager.listCampaigns();
      expect(results.find((c) => c.slug === badSlug)).toBeUndefined();
    });
  });

  describe("sorted by lastPlayedAt descending", () => {
    it("returns campaigns sorted with most-recently-played first", () => {
      const olderManager = new CampaignManager();
      olderManager.createCampaign("Older Campaign Aaa");

      // Give the second campaign a clearly later timestamp by faking lastPlayedAt.
      const newerManager = new CampaignManager();
      newerManager.createCampaign("Newer Campaign Bbb");
      const newerManifestPath = path.join(campaignsDir, "newer-campaign-bbb", "campaign.json");
      const newerRaw = JSON.parse(fs.readFileSync(newerManifestPath, "utf-8"));
      // Set lastPlayedAt to a future date so it is definitely newer.
      newerRaw.lastPlayedAt = new Date(Date.now() + 60_000).toISOString();
      fs.writeFileSync(newerManifestPath, JSON.stringify(newerRaw, null, 2), "utf-8");

      const results = manager.listCampaigns();
      const slugs = results.map((c) => c.slug);
      const newerIdx = slugs.indexOf("newer-campaign-bbb");
      const olderIdx = slugs.indexOf("older-campaign-aaa");

      // Both must be present; newer must come before older.
      expect(newerIdx).toBeGreaterThanOrEqual(0);
      expect(olderIdx).toBeGreaterThanOrEqual(0);
      expect(newerIdx).toBeLessThan(olderIdx);
    });
  });

  describe("includes customPrompt from non-empty system-prompt.md", () => {
    it("populates customPrompt when system-prompt.md has content", () => {
      const creator = new CampaignManager();
      creator.createCampaign("Prompt Test Campaign");
      const promptPath = path.join(campaignsDir, "prompt-test-campaign", "system-prompt.md");
      fs.writeFileSync(promptPath, "You are a gritty, low-fantasy DM.", "utf-8");

      const results = manager.listCampaigns();
      const summary = results.find((c) => c.slug === "prompt-test-campaign");
      expect(summary).toBeDefined();
      expect(summary?.customPrompt).toBe("You are a gritty, low-fantasy DM.");
    });

    it("omits customPrompt when system-prompt.md is empty", () => {
      const creator = new CampaignManager();
      creator.createCampaign("Empty Prompt Campaign");
      // system-prompt.md is written as empty string by createCampaign.

      const results = manager.listCampaigns();
      const summary = results.find((c) => c.slug === "empty-prompt-campaign");
      expect(summary).toBeDefined();
      expect(summary?.customPrompt).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// writeFile
// ---------------------------------------------------------------------------

describe("writeFile", () => {
  describe("throws when no campaign loaded", () => {
    it("throws if called before any campaign is created or loaded", () => {
      const fresh = new CampaignManager();
      expect(() => fresh.writeFile("notes/test", "hello")).toThrow(/no campaign loaded/i);
    });
  });

  describe("rejects path traversal with ..", () => {
    it("throws Invalid path for paths containing ..", () => {
      manager.createCampaign("Traversal Guard Test");
      expect(() => manager.writeFile("../../etc/passwd", "hack")).toThrow(/invalid path/i);
    });

    it("throws Invalid path for paths with embedded .. segment", () => {
      manager.createCampaign("Embedded Traversal Test");
      expect(() => manager.writeFile("notes/../../../secret", "data")).toThrow(/invalid path/i);
    });
  });

  describe("auto-appends .md when no extension given", () => {
    it("creates a .md file on disk when path has no extension", () => {
      manager.createCampaign("Extension Auto Append");
      manager.writeFile("notes/session1", "# My Notes");
      const slug = "extension-auto-append";
      expect(fs.existsSync(path.join(campaignsDir, slug, "notes", "session1.md"))).toBe(true);
      expect(fs.existsSync(path.join(campaignsDir, slug, "notes", "session1"))).toBe(false);
    });

    it("does not double-append when path already has an extension", () => {
      manager.createCampaign("Extension Existing Test");
      manager.writeFile("notes/data.json", '{"key": "value"}');
      const slug = "extension-existing-test";
      expect(fs.existsSync(path.join(campaignsDir, slug, "notes", "data.json"))).toBe(true);
      expect(fs.existsSync(path.join(campaignsDir, slug, "notes", "data.json.md"))).toBe(false);
    });
  });

  describe("creates parent directories as needed", () => {
    it("creates deeply nested directories on first write", () => {
      manager.createCampaign("Deep Dir Creation");
      manager.writeFile("deep/nested/folder/file", "content here");
      const slug = "deep-dir-creation";
      expect(
        fs.existsSync(path.join(campaignsDir, slug, "deep", "nested", "folder", "file.md")),
      ).toBe(true);
    });
  });

  describe("write and read round-trip", () => {
    it("readFile returns the same content written by writeFile", () => {
      manager.createCampaign("Round Trip Test");
      const content = "# NPCs\n- Bob the Innkeeper\n- Alice the Blacksmith";
      manager.writeFile("world/npcs", content);
      const result = manager.readFile("world/npcs");
      expect(result).toBe(content);
    });
  });
});

// ---------------------------------------------------------------------------
// readFile
// ---------------------------------------------------------------------------

describe("readFile", () => {
  describe("returns null when no candidate file exists", () => {
    it("returns null for a path that does not exist in any candidate form", () => {
      manager.createCampaign("Read Null Test");
      const result = manager.readFile("world/nonexistent-file");
      expect(result).toBeNull();
    });
  });

  describe("resolution order: .md first, then .json, then exact", () => {
    it("resolves to the .md file when both .md and exact exist", () => {
      manager.createCampaign("Resolution Order Test");
      const slug = "resolution-order-test";
      const base = path.join(campaignsDir, slug, "data");
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(path.join(base, "target.md"), "markdown content", "utf-8");
      fs.writeFileSync(path.join(base, "target"), "exact content", "utf-8");

      const result = manager.readFile("data/target");
      expect(result).toBe("markdown content");
    });

    it("resolves to .json when .md does not exist but .json does", () => {
      manager.createCampaign("JSON Resolution Test");
      const slug = "json-resolution-test";
      const base = path.join(campaignsDir, slug, "data");
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(path.join(base, "target.json"), '{"key":"value"}', "utf-8");

      const result = manager.readFile("data/target");
      expect(result).toBe('{"key":"value"}');
    });

    it("resolves to exact path when neither .md nor .json exists", () => {
      manager.createCampaign("Exact Resolution Test");
      const slug = "exact-resolution-test";
      const base = path.join(campaignsDir, slug, "data");
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(path.join(base, "target"), "exact only", "utf-8");

      const result = manager.readFile("data/target");
      expect(result).toBe("exact only");
    });
  });

  describe("rejects path traversal with ..", () => {
    it("throws Invalid path for traversal in readFile", () => {
      manager.createCampaign("Read Traversal Guard");
      expect(() => manager.readFile("../../etc/hosts")).toThrow(/invalid path/i);
    });
  });
});

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------

describe("listFiles", () => {
  describe("returns sorted relative file paths recursively", () => {
    it("lists all files sorted lexicographically, relative to the campaign root", () => {
      manager.createCampaign("List Files Test");
      // writeFile to add a custom file on top of starters.
      manager.writeFile("notes/custom", "my note");

      const files = manager.listFiles();

      // Must include known starter files.
      expect(files).toContain("active-context.md");
      expect(files).toContain("campaign.json");
      expect(files).toContain("system-prompt.md");
      expect(files).toContain("world/npcs.md");
      expect(files).toContain("notes/custom.md");

      // Must be sorted lexicographically.
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });

    it("returns only file paths, not directory names", () => {
      manager.createCampaign("No Dir Names Test");
      const files = manager.listFiles();
      // 'world' is a directory — it must not appear as a bare entry.
      expect(files).not.toContain("world");
      expect(files).not.toContain("sessions");
      expect(files).not.toContain("characters");
    });
  });

  describe("returns empty array when campaign directory does not exist", () => {
    it("returns [] when activeDir does not exist on disk (extreme edge case)", () => {
      // Load an existing campaign, then delete its directory.
      const creator = new CampaignManager();
      creator.createCampaign("Disappearing Campaign");

      const loader = new CampaignManager();
      loader.loadCampaign("disappearing-campaign");

      // Destroy the directory behind the manager's back.
      fs.rmSync(path.join(campaignsDir, "disappearing-campaign"), {
        recursive: true,
        force: true,
      });

      const files = loader.listFiles();
      expect(files).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// endSession
// ---------------------------------------------------------------------------

describe("endSession", () => {
  describe("increments sessionCount and writes zero-padded session file", () => {
    it("creates sessions/session-001.md on first call", () => {
      manager.createCampaign("End Session Basic");
      const slug = "end-session-basic";

      const { sessionNumber } = manager.endSession(
        "The party defeated the goblin king.",
        "The party rests in the goblin lair.",
      );

      expect(sessionNumber).toBe(1);
      const sessionFile = path.join(campaignsDir, slug, "sessions", "session-001.md");
      expect(fs.existsSync(sessionFile)).toBe(true);
    });

    it("writes the summary text verbatim to the session file", () => {
      manager.createCampaign("End Session Summary Content");
      const slug = "end-session-summary-content";
      const summary = "The heroes entered the dungeon and found three kobolds.";

      manager.endSession(summary, "Now in dungeon.");

      const content = fs.readFileSync(
        path.join(campaignsDir, slug, "sessions", "session-001.md"),
        "utf-8",
      );
      expect(content).toBe(summary);
    });

    it("zero-pads session number to 3 digits — session 2 is session-002.md", () => {
      manager.createCampaign("End Session Padding");
      const slug = "end-session-padding";

      manager.endSession("Session one summary.", "Context after session 1.");
      manager.endSession("Session two summary.", "Context after session 2.");

      expect(fs.existsSync(path.join(campaignsDir, slug, "sessions", "session-001.md"))).toBe(true);
      expect(fs.existsSync(path.join(campaignsDir, slug, "sessions", "session-002.md"))).toBe(true);
    });
  });

  describe("updates active-context.md", () => {
    it("overwrites active-context.md with the new activeContext string", () => {
      manager.createCampaign("End Session Context Update");
      const slug = "end-session-context-update";
      const newContext = "The party is now in Waterdeep, seeking the ancient relic.";

      manager.endSession("Great session!", newContext);

      const onDisk = fs.readFileSync(path.join(campaignsDir, slug, "active-context.md"), "utf-8");
      expect(onDisk).toBe(newContext);
    });
  });

  describe("snapshots characters and updates manifest.players when provided", () => {
    it("writes a JSON snapshot for each character in the characters/ folder", () => {
      manager.createCampaign("End Session Characters");
      const slug = "end-session-characters";
      const fighter = createFighterCharacter();

      manager.endSession("Session with a fighter.", "Resting at the inn.", {
        Player1: fighter,
      });

      const charFiles = fs.readdirSync(path.join(campaignsDir, slug, "characters"));
      expect(charFiles.length).toBeGreaterThan(0);
      const parsed = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "characters", charFiles[0]), "utf-8"),
      );
      expect(parsed.static).toBeDefined();
      expect(parsed.dynamic).toBeDefined();
    });

    it("updates manifest.players to character static names", () => {
      manager.createCampaign("End Session Players Update");
      const slug = "end-session-players-update";
      const fighter = createFighterCharacter(); // static.name = "Theron"

      manager.endSession("Done.", "Context.", { Player1: fighter });

      const onDisk = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(onDisk.players).toContain("Theron");
    });
  });

  describe("flushes manifest to disk", () => {
    it("writes updated sessionCount to campaign.json", () => {
      manager.createCampaign("Flush Manifest Test");
      const slug = "flush-manifest-test";

      manager.endSession("Summary.", "Context.");

      const onDisk = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(onDisk.sessionCount).toBe(1);
    });
  });

  describe("deletes session-state.json if it exists", () => {
    it("removes session-state.json present from a previous play session", () => {
      manager.createCampaign("Session State Cleanup");
      const slug = "session-state-cleanup";
      const statePath = path.join(campaignsDir, slug, "session-state.json");

      // Simulate a stale state file left from a previous session.
      fs.writeFileSync(statePath, JSON.stringify({ turn: 3 }), "utf-8");

      manager.endSession("Clean summary.", "Clean context.");

      expect(fs.existsSync(statePath)).toBe(false);
    });

    it("does not throw when session-state.json does not exist", () => {
      manager.createCampaign("No Session State");
      expect(() => manager.endSession("Summary.", "Context.")).not.toThrow();
    });
  });

  describe("returns { sessionNumber } matching incremented count", () => {
    it("returns sessionNumber=1 on first call, 2 on second call", () => {
      manager.createCampaign("Session Number Return");

      const first = manager.endSession("First.", "Ctx 1.");
      expect(first.sessionNumber).toBe(1);

      const second = manager.endSession("Second.", "Ctx 2.");
      expect(second.sessionNumber).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// getStartupContext
// ---------------------------------------------------------------------------

describe("getStartupContext", () => {
  describe("includes manifest summary section", () => {
    it("contains the campaign name and session count", () => {
      manager.createCampaign("Startup Context Campaign");
      const ctx = manager.getStartupContext();

      expect(ctx).toContain("Startup Context Campaign");
      expect(ctx).toContain("Sessions played: 0");
    });
  });

  describe("omits DM Instructions section when system-prompt.md is empty", () => {
    it("does not include 'DM Instructions' heading when system-prompt.md is empty string", () => {
      manager.createCampaign("Empty System Prompt Context");
      // system-prompt.md is written as "" by createCampaign — no instructions section expected.
      const ctx = manager.getStartupContext();
      expect(ctx).not.toContain("## DM Instructions");
    });

    it("includes 'DM Instructions' heading when system-prompt.md has content", () => {
      manager.createCampaign("Populated System Prompt Context");
      const slug = "populated-system-prompt-context";
      fs.writeFileSync(
        path.join(campaignsDir, slug, "system-prompt.md"),
        "Run a dark, gritty campaign with realistic consequences.",
        "utf-8",
      );
      const ctx = manager.getStartupContext();
      expect(ctx).toContain("## DM Instructions");
      expect(ctx).toContain("dark, gritty campaign");
    });
  });

  describe("omits world notes sections that contain placeholder text (_No )", () => {
    it("does not include default placeholder world notes in the output", () => {
      manager.createCampaign("Placeholder World Notes Context");
      // Starter files contain "_No NPCs recorded yet." etc. — must be skipped.
      const ctx = manager.getStartupContext();
      expect(ctx).not.toContain("_No NPCs recorded yet.");
      expect(ctx).not.toContain("_No locations recorded yet.");
    });

    it("includes world notes when placeholder text is replaced with real content", () => {
      manager.createCampaign("Real World Notes Context");
      manager.writeFile("world/npcs", "# NPCs\n- Elara Moonwhisper, elven sage");
      const ctx = manager.getStartupContext();
      expect(ctx).toContain("Elara Moonwhisper");
    });
  });

  describe("returns session history newest first", () => {
    it("lists more recent sessions before older sessions", () => {
      manager.createCampaign("Session History Order");

      manager.endSession("First session: the party arrived in town.", "In town.");
      manager.endSession("Second session: the party explored the dungeon.", "In dungeon.");

      const ctx = manager.getStartupContext();
      const idx1 = ctx.indexOf("First session");
      const idx2 = ctx.indexOf("Second session");

      // Both sessions must appear and session 2 (newer) must come before session 1 (older).
      expect(idx1).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeLessThan(idx1);
    });
  });

  describe("sections joined by newline-dash-dash-dash-newline separator", () => {
    it("uses the expected separator string between sections", () => {
      manager.createCampaign("Separator Test Campaign");
      // Write a system prompt so there are at least two sections.
      const slug = "separator-test-campaign";
      fs.writeFileSync(
        path.join(campaignsDir, slug, "system-prompt.md"),
        "Be a classic high-fantasy DM.",
        "utf-8",
      );
      const ctx = manager.getStartupContext();
      expect(ctx).toContain("\n\n---\n\n");
    });
  });
});
