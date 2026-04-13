import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createFighterCharacter } from "./fixtures.js";

/**
 * Tests for CampaignManager.loadCharacterSnapshotsWithIds Zod-validated loading
 * (Phase 8 — data lifecycle refactor).
 *
 * Covered here:
 *   1. Round-trip: snapshotCharacters then loadCharacterSnapshotsWithIds returns
 *      fully-typed CharacterStaticData + CharacterDynamicData.
 *   2. Corrupt JSON: file with invalid JSON syntax is skipped with a console.warn.
 *   3. Missing required field: structurally invalid snapshot is skipped with a
 *      console.warn and the result excludes that key.
 *
 * These tests use an isolated temp directory set via UNSEEN_CAMPAIGNS_DIR to
 * avoid touching the real `.unseen/` directory. The module is re-imported after
 * setting the env var so that CAMPAIGNS_ROOT is evaluated with the correct path.
 */

// ---------------------------------------------------------------------------
// Module-level lazy import — CAMPAIGNS_ROOT is evaluated at import time.
// ---------------------------------------------------------------------------

let CampaignManager: typeof import("../services/campaign-manager.js").CampaignManager;
let tmpDir: string;
let campaignsDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-manager-test-"));
  campaignsDir = path.join(tmpDir, "campaigns");

  vi.stubEnv("UNSEEN_CAMPAIGNS_DIR", campaignsDir);
  vi.resetModules();

  const mod = await import("../services/campaign-manager.js");
  CampaignManager = mod.CampaignManager;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Round-trip: valid snapshot survives write+read with full type fidelity
// ---------------------------------------------------------------------------

describe("loadCharacterSnapshotsWithIds — Zod validation", () => {
  describe("round-trip: valid snapshot returns fully-typed data", () => {
    it("loaded static and dynamic match the written character data", () => {
      const manager = new CampaignManager();
      manager.createCampaign("Lifecycle RT Valid");

      const fighter = createFighterCharacter();
      manager.snapshotCharacters({ Theron: fighter }, { Theron: "uid-theron-1" });

      const result = manager.loadCharacterSnapshotsWithIds();

      expect(result.characters["Theron"]).toBeDefined();
      expect(result.characters["Theron"].static.name).toBe(fighter.static.name);
      expect(result.characters["Theron"].dynamic.currentHP).toBe(fighter.dynamic.currentHP);
      expect(result.userIds["Theron"]).toBe("uid-theron-1");
    });

    it("loaded static data carries all required CharacterStaticData fields", () => {
      const manager = new CampaignManager();
      manager.createCampaign("Lifecycle RT Fields");

      const fighter = createFighterCharacter();
      manager.snapshotCharacters({ Player1: fighter });

      const result = manager.loadCharacterSnapshotsWithIds();
      const stat = result.characters["Player1"].static;

      // Required CharacterStaticData fields must survive round-trip
      expect(typeof stat.name).toBe("string");
      expect(typeof stat.race).toBe("string");
      expect(Array.isArray(stat.classes)).toBe(true);
      expect(typeof stat.abilities.strength).toBe("number");
      expect(Array.isArray(stat.effects)).toBe(true);
      expect(typeof stat.importedAt).toBe("number");
    });

    it("loaded dynamic data carries all required CharacterDynamicData fields", () => {
      const manager = new CampaignManager();
      manager.createCampaign("Lifecycle RT Dynamic");

      const fighter = createFighterCharacter();
      manager.snapshotCharacters({ Player1: fighter });

      const result = manager.loadCharacterSnapshotsWithIds();
      const dyn = result.characters["Player1"].dynamic;

      expect(typeof dyn.currentHP).toBe("number");
      expect(typeof dyn.tempHP).toBe("number");
      expect(Array.isArray(dyn.conditions)).toBe(true);
      expect(Array.isArray(dyn.inventory)).toBe(true);
      expect(typeof dyn.currency.gp).toBe("number");
      expect(typeof dyn.deathSaves.successes).toBe("number");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Corrupt JSON — parse failure logs warning and skips file
  // -------------------------------------------------------------------------

  describe("corrupt JSON file is skipped with a warning", () => {
    it("returns empty characters map when only file is corrupt JSON", () => {
      const manager = new CampaignManager();
      manager.createCampaign("Lifecycle Corrupt JSON");
      const slug = "lifecycle-corrupt-json";
      const charDir = path.join(campaignsDir, slug, "characters");
      fs.mkdirSync(charDir, { recursive: true });
      // Write a file with invalid JSON syntax
      fs.writeFileSync(path.join(charDir, "bad.json"), "{ not valid json !!!", "utf-8");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.loadCharacterSnapshotsWithIds();

      expect(Object.keys(result.characters)).toHaveLength(0);
      // Must log a warning mentioning the file name
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toMatch(/bad\.json/);
    });

    it("logs warning and skips corrupt file but still loads valid sibling", () => {
      const manager = new CampaignManager();
      manager.createCampaign("Lifecycle Corrupt Sibling");
      const slug = "lifecycle-corrupt-sibling";

      const fighter = createFighterCharacter();
      manager.snapshotCharacters({ Theron: fighter });

      const charDir = path.join(campaignsDir, slug, "characters");
      fs.writeFileSync(path.join(charDir, "corrupt.json"), "NOTJSON", "utf-8");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.loadCharacterSnapshotsWithIds();

      // The valid character still loads
      expect(result.characters["Theron"]).toBeDefined();
      // The corrupt file produced exactly one warning
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toMatch(/corrupt\.json/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Missing required field — schema rejection logs warning and skips file
  // -------------------------------------------------------------------------

  describe("structurally invalid snapshot is skipped with a warning", () => {
    it("skips a snapshot missing static.name with a console.warn", () => {
      const manager = new CampaignManager();
      manager.createCampaign("Lifecycle Missing Name");
      const slug = "lifecycle-missing-name";
      const charDir = path.join(campaignsDir, slug, "characters");
      fs.mkdirSync(charDir, { recursive: true });

      // Write a snapshot that has static/dynamic but static.name is absent
      const fighter = createFighterCharacter();
      const { name: _name, ...staticWithoutName } = fighter.static;
      const malformed = {
        playerName: "Ghost",
        static: staticWithoutName,
        dynamic: fighter.dynamic,
      };
      fs.writeFileSync(
        path.join(charDir, "ghost.json"),
        JSON.stringify(malformed, null, 2),
        "utf-8",
      );

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.loadCharacterSnapshotsWithIds();

      expect(result.characters["Ghost"]).toBeUndefined();
      expect(Object.keys(result.characters)).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toMatch(/ghost\.json/);
    });

    it("skips a snapshot missing dynamic entirely with a console.warn", () => {
      const manager = new CampaignManager();
      manager.createCampaign("Lifecycle Missing Dynamic");
      const slug = "lifecycle-missing-dynamic";
      const charDir = path.join(campaignsDir, slug, "characters");
      fs.mkdirSync(charDir, { recursive: true });

      const fighter = createFighterCharacter();
      const malformed = {
        playerName: "Phantom",
        static: fighter.static,
        // dynamic intentionally absent
      };
      fs.writeFileSync(
        path.join(charDir, "phantom.json"),
        JSON.stringify(malformed, null, 2),
        "utf-8",
      );

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = manager.loadCharacterSnapshotsWithIds();

      expect(result.characters["Phantom"]).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toMatch(/phantom\.json/);
    });
  });
});
