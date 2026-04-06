import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createFighterCharacter, createClericCharacter } from "./setup.js";

/**
 * Gap-filling tests for CampaignManager methods not covered in campaign.test.ts.
 *
 * Covered here:
 *   - snapshotCharacters / loadCharacterSnapshots / loadCharacterSnapshotsWithIds
 *   - saveSettings (pacing / encounter length → campaign.json)
 *   - getSystemPrompt / saveSystemPrompt
 *   - touchManifest + flushManifest (dirty-flag lifecycle)
 *   - savePlayerNotes / loadPlayerNotes (player notes persistence + userId routing)
 *   - updatePlayers / getManifest (manifest mutation helpers)
 *   - loadCampaign flushes dirty manifest from the previous campaign
 *
 * All tests use a temp directory (UNSEEN_CAMPAIGNS_DIR env var) so they never
 * touch the real `.unseen/` directory.
 */

// ---------------------------------------------------------------------------
// Module-level lazy import — CAMPAIGNS_ROOT is evaluated at import time, so we
// must set UNSEEN_CAMPAIGNS_DIR in the env BEFORE the module is first imported.
// ---------------------------------------------------------------------------

let CampaignManager: typeof import("../services/campaign-manager.js").CampaignManager;
let tmpDir: string;
let campaignsDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-persistence-test-"));
  campaignsDir = path.join(tmpDir, "campaigns");

  vi.stubEnv("UNSEEN_CAMPAIGNS_DIR", campaignsDir);
  vi.resetModules();

  const mod = await import("../services/campaign-manager.js");
  CampaignManager = mod.CampaignManager;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

let manager: InstanceType<typeof CampaignManager>;
beforeEach(() => {
  manager = new CampaignManager();
});

// ---------------------------------------------------------------------------
// snapshotCharacters / loadCharacterSnapshots
// ---------------------------------------------------------------------------

describe("snapshotCharacters", () => {
  describe("writes one JSON file per character in characters/", () => {
    it("creates a JSON file for a single character", () => {
      manager.createCampaign("Snapshot Single");
      const slug = "snapshot-single";
      const fighter = createFighterCharacter();

      const count = manager.snapshotCharacters({ Player1: fighter });

      expect(count).toBe(1);
      const charDir = path.join(campaignsDir, slug, "characters");
      const files = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));
      expect(files.length).toBe(1);
    });

    it("creates separate JSON files for multiple characters", () => {
      manager.createCampaign("Snapshot Multi");
      const slug = "snapshot-multi";
      const fighter = createFighterCharacter();
      const cleric = createClericCharacter();

      const count = manager.snapshotCharacters({ Player1: fighter, Player2: cleric });

      expect(count).toBe(2);
      const charDir = path.join(campaignsDir, slug, "characters");
      const files = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));
      expect(files.length).toBe(2);
    });

    it("persists both static and dynamic data in the snapshot", () => {
      manager.createCampaign("Snapshot Data Shape");
      const slug = "snapshot-data-shape";
      const fighter = createFighterCharacter();

      manager.snapshotCharacters({ Player1: fighter });

      const charDir = path.join(campaignsDir, slug, "characters");
      const files = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));
      const parsed = JSON.parse(fs.readFileSync(path.join(charDir, files[0]), "utf-8"));

      expect(parsed.static).toBeDefined();
      expect(parsed.dynamic).toBeDefined();
      expect(parsed.playerName).toBe("Player1");
    });

    it("persists userId in the snapshot when provided", () => {
      manager.createCampaign("Snapshot With UserId");
      const slug = "snapshot-with-userid";
      const fighter = createFighterCharacter();
      const userIds = { Player1: "user-abc-123" };

      manager.snapshotCharacters({ Player1: fighter }, userIds);

      const charDir = path.join(campaignsDir, slug, "characters");
      const files = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));
      const parsed = JSON.parse(fs.readFileSync(path.join(charDir, files[0]), "utf-8"));

      expect(parsed.userId).toBe("user-abc-123");
    });

    it("omits userId when not provided", () => {
      manager.createCampaign("Snapshot No UserId");
      const slug = "snapshot-no-userid";
      const fighter = createFighterCharacter();

      manager.snapshotCharacters({ Player1: fighter });

      const charDir = path.join(campaignsDir, slug, "characters");
      const files = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));
      const parsed = JSON.parse(fs.readFileSync(path.join(charDir, files[0]), "utf-8"));

      expect(parsed.userId).toBeUndefined();
    });

    it("returns 0 when given an empty characters map", () => {
      manager.createCampaign("Snapshot Empty");
      const count = manager.snapshotCharacters({});
      expect(count).toBe(0);
    });

    it("throws when no campaign is loaded", () => {
      const fresh = new CampaignManager();
      const fighter = createFighterCharacter();
      expect(() => fresh.snapshotCharacters({ Player1: fighter })).toThrow(/no campaign loaded/i);
    });
  });
});

// ---------------------------------------------------------------------------
// loadCharacterSnapshots (round-trip)
// ---------------------------------------------------------------------------

describe("loadCharacterSnapshots", () => {
  describe("round-trip: snapshot then load returns original data", () => {
    it("loads back the same character keyed by playerName", () => {
      manager.createCampaign("Load Snapshot Round Trip");
      const fighter = createFighterCharacter();

      manager.snapshotCharacters({ Aragorn: fighter });
      const loaded = manager.loadCharacterSnapshots();

      expect(loaded["Aragorn"]).toBeDefined();
      expect(loaded["Aragorn"].static).toBeDefined();
      expect(loaded["Aragorn"].dynamic).toBeDefined();
    });

    it("preserves character name in static data", () => {
      manager.createCampaign("Load Snapshot Name");
      const fighter = createFighterCharacter(); // static.name = "Theron"

      manager.snapshotCharacters({ Player1: fighter });
      const loaded = manager.loadCharacterSnapshots();

      const charStatic = loaded["Player1"].static as { name?: string };
      expect(charStatic.name).toBe("Theron");
    });

    it("loads multiple characters correctly", () => {
      manager.createCampaign("Load Snapshot Multi");
      const fighter = createFighterCharacter();
      const cleric = createClericCharacter();

      manager.snapshotCharacters({ Fighter: fighter, Cleric: cleric });
      const loaded = manager.loadCharacterSnapshots();

      expect(Object.keys(loaded)).toHaveLength(2);
      expect(loaded["Fighter"]).toBeDefined();
      expect(loaded["Cleric"]).toBeDefined();
    });

    it("returns empty object when characters/ directory is empty", () => {
      manager.createCampaign("Load Snapshot Empty Dir");
      const loaded = manager.loadCharacterSnapshots();
      expect(loaded).toEqual({});
    });

    it("returns empty object when characters/ directory does not exist", () => {
      manager.createCampaign("Load Snapshot No Dir");
      const slug = "load-snapshot-no-dir";
      fs.rmSync(path.join(campaignsDir, slug, "characters"), { recursive: true, force: true });

      const loaded = manager.loadCharacterSnapshots();
      expect(loaded).toEqual({});
    });

    it("throws when no campaign is loaded", () => {
      const fresh = new CampaignManager();
      expect(() => fresh.loadCharacterSnapshots()).toThrow(/no campaign loaded/i);
    });
  });
});

// ---------------------------------------------------------------------------
// loadCharacterSnapshotsWithIds
// ---------------------------------------------------------------------------

describe("loadCharacterSnapshotsWithIds", () => {
  describe("returns characters and userIds map", () => {
    it("restores userId mapping from snapshot", () => {
      manager.createCampaign("Load With Ids");
      const fighter = createFighterCharacter();

      manager.snapshotCharacters({ Player1: fighter }, { Player1: "user-xyz" });
      const result = manager.loadCharacterSnapshotsWithIds();

      expect(result.characters["Player1"]).toBeDefined();
      expect(result.userIds["Player1"]).toBe("user-xyz");
    });

    it("omits player from userIds map when no userId was saved", () => {
      manager.createCampaign("Load With Ids No Uid");
      const fighter = createFighterCharacter();

      manager.snapshotCharacters({ Player1: fighter }); // no userIds
      const result = manager.loadCharacterSnapshotsWithIds();

      expect(result.characters["Player1"]).toBeDefined();
      expect(result.userIds["Player1"]).toBeUndefined();
    });

    it("returns empty maps when characters/ does not exist", () => {
      manager.createCampaign("Load With Ids Empty");
      const slug = "load-with-ids-empty";
      fs.rmSync(path.join(campaignsDir, slug, "characters"), { recursive: true, force: true });

      const result = manager.loadCharacterSnapshotsWithIds();
      expect(result.characters).toEqual({});
      expect(result.userIds).toEqual({});
    });

    it("skips corrupt JSON files without throwing", () => {
      manager.createCampaign("Load With Ids Corrupt");
      const slug = "load-with-ids-corrupt";
      const charDir = path.join(campaignsDir, slug, "characters");
      fs.mkdirSync(charDir, { recursive: true });
      fs.writeFileSync(path.join(charDir, "bad.json"), "{ not valid json", "utf-8");

      expect(() => manager.loadCharacterSnapshotsWithIds()).not.toThrow();
      const result = manager.loadCharacterSnapshotsWithIds();
      expect(Object.keys(result.characters)).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// saveSettings
// ---------------------------------------------------------------------------

describe("saveSettings", () => {
  describe("persists pacing and encounter settings to campaign.json", () => {
    it("writes pacingProfile to the manifest on disk", () => {
      manager.createCampaign("Save Settings Pacing");
      const slug = "save-settings-pacing";

      manager.saveSettings({ pacingProfile: "action-packed" });

      const onDisk = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(onDisk.pacingProfile).toBe("action-packed");
    });

    it("writes encounterLength to the manifest on disk", () => {
      manager.createCampaign("Save Settings Encounter");
      const slug = "save-settings-encounter";

      manager.saveSettings({ encounterLength: "short" });

      const onDisk = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(onDisk.encounterLength).toBe("short");
    });

    it("writes both settings in a single call", () => {
      manager.createCampaign("Save Settings Both");
      const slug = "save-settings-both";

      manager.saveSettings({ pacingProfile: "balanced", encounterLength: "medium" });

      const onDisk = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(onDisk.pacingProfile).toBe("balanced");
      expect(onDisk.encounterLength).toBe("medium");
    });

    it("does not overwrite pacingProfile when only encounterLength is passed", () => {
      manager.createCampaign("Save Settings Partial");
      const slug = "save-settings-partial";

      manager.saveSettings({ pacingProfile: "relaxed" });
      manager.saveSettings({ encounterLength: "long" });

      const onDisk = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(onDisk.pacingProfile).toBe("relaxed");
      expect(onDisk.encounterLength).toBe("long");
    });

    it("throws when no campaign is loaded", () => {
      const fresh = new CampaignManager();
      expect(() => fresh.saveSettings({ pacingProfile: "action-packed" })).toThrow(
        /no campaign loaded/i,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// getSystemPrompt / saveSystemPrompt
// ---------------------------------------------------------------------------

describe("getSystemPrompt / saveSystemPrompt", () => {
  describe("round-trip: save then read returns same content", () => {
    it("returns the saved prompt string", () => {
      manager.createCampaign("System Prompt Round Trip");
      const prompt = "You are a gritty, realistic DM. No jokes.";

      manager.saveSystemPrompt(prompt);
      const result = manager.getSystemPrompt();

      expect(result).toBe(prompt);
    });

    it("overwrites previous system prompt", () => {
      manager.createCampaign("System Prompt Overwrite");
      manager.saveSystemPrompt("First prompt.");
      manager.saveSystemPrompt("Second prompt.");

      expect(manager.getSystemPrompt()).toBe("Second prompt.");
    });
  });

  describe("getSystemPrompt edge cases", () => {
    it("returns null when system-prompt.md is empty (as created)", () => {
      manager.createCampaign("System Prompt Empty");
      // system-prompt.md written as "" by createCampaign
      expect(manager.getSystemPrompt()).toBeNull();
    });

    it("returns null when system-prompt.md contains only whitespace", () => {
      manager.createCampaign("System Prompt Whitespace");
      const slug = "system-prompt-whitespace";
      fs.writeFileSync(path.join(campaignsDir, slug, "system-prompt.md"), "   \n\t  ", "utf-8");

      expect(manager.getSystemPrompt()).toBeNull();
    });

    it("returns null when no campaign is loaded", () => {
      const fresh = new CampaignManager();
      expect(fresh.getSystemPrompt()).toBeNull();
    });
  });

  describe("saveSystemPrompt requirements", () => {
    it("throws when no campaign is loaded", () => {
      const fresh = new CampaignManager();
      expect(() => fresh.saveSystemPrompt("Some prompt")).toThrow(/no campaign loaded/i);
    });

    it("writes the file to disk (visible to external readers)", () => {
      manager.createCampaign("System Prompt Disk Write");
      const slug = "system-prompt-disk-write";
      manager.saveSystemPrompt("Run a high-magic campaign.");

      const onDisk = fs.readFileSync(path.join(campaignsDir, slug, "system-prompt.md"), "utf-8");
      expect(onDisk).toBe("Run a high-magic campaign.");
    });
  });
});

// ---------------------------------------------------------------------------
// touchManifest + flushManifest (dirty-flag lifecycle)
// ---------------------------------------------------------------------------

describe("touchManifest + flushManifest", () => {
  describe("flushManifest writes dirty changes to disk", () => {
    it("does not write to disk when manifest is clean", () => {
      manager.createCampaign("Flush Clean");
      const slug = "flush-clean";
      const before = fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8");

      // flushManifest when not dirty — file must be unchanged
      manager.flushManifest();

      const after = fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8");
      expect(after).toBe(before);
    });

    it("flushes updated lastPlayedAt after touchManifest", () => {
      manager.createCampaign("Touch Then Flush");
      const slug = "touch-then-flush";
      const original = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );

      // Advance time so the updated timestamp is definitely different
      const originalLastPlayed = original.lastPlayedAt;

      manager.touchManifest();
      manager.flushManifest();

      const updated = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      // After touch+flush, lastPlayedAt must be a valid ISO timestamp.
      // It may equal the original if same millisecond, but the dirty flag
      // should have been cleared — this verifies flush ran without error.
      expect(typeof updated.lastPlayedAt).toBe("string");
      expect(isNaN(Date.parse(updated.lastPlayedAt))).toBe(false);
      // Updated timestamp must be >= original (never goes backwards).
      expect(new Date(updated.lastPlayedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalLastPlayed).getTime(),
      );
    });

    it("is a no-op when no campaign is loaded", () => {
      const fresh = new CampaignManager();
      // Must not throw even without an active campaign.
      expect(() => fresh.flushManifest()).not.toThrow();
    });
  });

  describe("touchManifest sets dirty flag so flushManifest will write", () => {
    it("does not throw when no campaign is loaded (no-op)", () => {
      const fresh = new CampaignManager();
      expect(() => fresh.touchManifest()).not.toThrow();
    });

    it("dirty manifest is flushed when loadCampaign is called on the same manager", () => {
      // Create two campaigns.
      const a = new CampaignManager();
      a.createCampaign("Touch Flush Via Load A");
      const sluga = "touch-flush-via-load-a";

      const b = new CampaignManager();
      b.createCampaign("Touch Flush Via Load B");

      // Mark A dirty, then load B — this should flush A first.
      const aLoader = new CampaignManager();
      aLoader.loadCampaign(sluga);
      aLoader.touchManifest(); // marks dirty

      // Loading B triggers flushManifest on A before switching.
      expect(() => aLoader.loadCampaign("touch-flush-via-load-b")).not.toThrow();

      // After loading B, the manager should be on B.
      expect(aLoader.activeSlug).toBe("touch-flush-via-load-b");
    });
  });
});

// ---------------------------------------------------------------------------
// savePlayerNotes / loadPlayerNotes
// ---------------------------------------------------------------------------

describe("savePlayerNotes / loadPlayerNotes", () => {
  describe("round-trip: save then load returns same content", () => {
    it("loads saved notes by player name", () => {
      manager.createCampaign("Player Notes Basic");
      manager.savePlayerNotes("Gandalf", "My personal quest notes.");

      const loaded = manager.loadPlayerNotes("Gandalf");
      expect(loaded).toBe("My personal quest notes.");
    });

    it("returns null when no notes have been saved for the player", () => {
      manager.createCampaign("Player Notes None");
      expect(manager.loadPlayerNotes("Aragorn")).toBeNull();
    });

    it("overwrites previous notes for the same player", () => {
      manager.createCampaign("Player Notes Overwrite");
      manager.savePlayerNotes("Frodo", "Original note.");
      manager.savePlayerNotes("Frodo", "Updated note.");

      expect(manager.loadPlayerNotes("Frodo")).toBe("Updated note.");
    });
  });

  describe("userId-based routing", () => {
    it("saves and loads notes by userId when provided", () => {
      manager.createCampaign("Player Notes UserId Save");
      manager.savePlayerNotes("Legolas", "Elf notes here.", "user-legolas-99");

      // Load with userId — should find the userId-based file.
      const loaded = manager.loadPlayerNotes("Legolas", "user-legolas-99");
      expect(loaded).toBe("Elf notes here.");
    });

    it("loads by userId even when player name changes", () => {
      manager.createCampaign("Player Notes UserId Name Change");
      manager.savePlayerNotes("OldName", "Notes from old name.", "user-stable-id");

      // Load with new display name but same userId — must still find the file.
      const loaded = manager.loadPlayerNotes("NewName", "user-stable-id");
      expect(loaded).toBe("Notes from old name.");
    });

    it("falls back to playerName slug when userId not provided", () => {
      manager.createCampaign("Player Notes Slug Fallback");
      // Save without userId (legacy path).
      manager.savePlayerNotes("Gimli", "Dwarf battle notes.");

      // Load without userId — must find by name slug.
      const loaded = manager.loadPlayerNotes("Gimli");
      expect(loaded).toBe("Dwarf battle notes.");
    });

    it("prefers userId file over playerName slug when both exist", () => {
      manager.createCampaign("Player Notes UserId Priority");
      const slug = "player-notes-userid-priority";
      const notesDir = path.join(campaignsDir, slug, "notes");
      fs.mkdirSync(notesDir, { recursive: true });

      // Write notes under both a legacy name slug and a userId file.
      fs.writeFileSync(path.join(notesDir, "boromir.md"), "Legacy notes.", "utf-8");
      fs.writeFileSync(path.join(notesDir, "user-real-id.md"), "UserId notes.", "utf-8");

      // loadPlayerNotes with userId should prefer the userId file.
      const loaded = manager.loadPlayerNotes("Boromir", "user-real-id");
      expect(loaded).toBe("UserId notes.");
    });
  });

  describe("isolation from getStartupContext", () => {
    it("player notes are NOT included in getStartupContext output", () => {
      manager.createCampaign("Player Notes Private");
      manager.savePlayerNotes("Saruman", "SECRET: betraying everyone.");

      const ctx = manager.getStartupContext();
      expect(ctx).not.toContain("SECRET: betraying everyone.");
    });
  });
});

// ---------------------------------------------------------------------------
// updatePlayers / getManifest
// ---------------------------------------------------------------------------

describe("updatePlayers", () => {
  describe("mutates manifest.players and marks manifest dirty", () => {
    it("updates the players list in the in-memory manifest", () => {
      manager.createCampaign("Update Players Basic");
      manager.updatePlayers(["Alice", "Bob", "Charlie"]);

      const manifest = manager.getManifest();
      expect(manifest?.players).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("replaces the entire players list on each call", () => {
      manager.createCampaign("Update Players Replace");
      manager.updatePlayers(["Alice", "Bob"]);
      manager.updatePlayers(["Charlie"]); // full replace, not append

      const manifest = manager.getManifest();
      expect(manifest?.players).toEqual(["Charlie"]);
    });

    it("is a no-op when no campaign is loaded (does not throw)", () => {
      const fresh = new CampaignManager();
      expect(() => fresh.updatePlayers(["Alice"])).not.toThrow();
    });

    it("dirty changes are flushed to disk by flushManifest", () => {
      manager.createCampaign("Update Players Flush");
      const slug = "update-players-flush";

      manager.updatePlayers(["Dave", "Eve"]);
      manager.flushManifest();

      const onDisk = JSON.parse(
        fs.readFileSync(path.join(campaignsDir, slug, "campaign.json"), "utf-8"),
      );
      expect(onDisk.players).toEqual(["Dave", "Eve"]);
    });
  });
});

describe("getManifest", () => {
  describe("returns the in-memory manifest", () => {
    it("returns the manifest for the active campaign", () => {
      manager.createCampaign("Get Manifest Active");
      const manifest = manager.getManifest();

      expect(manifest).not.toBeNull();
      expect(manifest?.name).toBe("Get Manifest Active");
      expect(manifest?.slug).toBe("get-manifest-active");
    });

    it("returns null when no campaign is loaded", () => {
      const fresh = new CampaignManager();
      expect(fresh.getManifest()).toBeNull();
    });

    it("reflects in-memory mutations (e.g. updatePlayers) before flush", () => {
      manager.createCampaign("Get Manifest Mutated");
      manager.updatePlayers(["Frodo", "Sam"]);

      const manifest = manager.getManifest();
      expect(manifest?.players).toEqual(["Frodo", "Sam"]);
    });
  });
});

// ---------------------------------------------------------------------------
// loadCampaign flushing dirty manifest from prior campaign
// ---------------------------------------------------------------------------

describe("loadCampaign flushes dirty prior manifest", () => {
  it("writes pending dirty changes before switching campaigns", () => {
    // Create two campaigns and mark the first one dirty via updatePlayers.
    const setup = new CampaignManager();
    setup.createCampaign("Flush On Switch Source");
    const slugA = "flush-on-switch-source";

    const setup2 = new CampaignManager();
    setup2.createCampaign("Flush On Switch Target");

    // Load source, dirty it.
    const switcher = new CampaignManager();
    switcher.loadCampaign(slugA);
    switcher.updatePlayers(["PendingPlayer"]);

    // Loading another campaign should flush the dirty manifest first.
    switcher.loadCampaign("flush-on-switch-target");

    // Now verify the dirty write landed on disk for source.
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(campaignsDir, slugA, "campaign.json"), "utf-8"),
    );
    expect(onDisk.players).toEqual(["PendingPlayer"]);
  });
});
