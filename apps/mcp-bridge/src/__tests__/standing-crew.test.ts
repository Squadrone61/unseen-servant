import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Tests for the Standing Crew memory layer:
 *   - turn-log per encounter (combat-resolver writes, conductor flushes via append)
 *   - session scratch (lorekeeper / conductor writes intra-session beats)
 *
 * Covers:
 *   1. Round-trip: append → read returns appended content
 *   2. lastNRounds trimming returns just the tail headers
 *   3. archiveTurnLog moves <slug>.md → <slug>.archive.md (and merges if archive
 *      already exists from an earlier engagement)
 *   4. Session scratch is scoped to the active session number and cleared on
 *      end_session
 *   5. appendTurnLog rejects an invalid slug (defends path traversal)
 */

let CampaignManager: typeof import("../services/campaign-manager.js").CampaignManager;
let tmpDir: string;
let campaignsDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "standing-crew-test-"));
  campaignsDir = path.join(tmpDir, "campaigns");

  vi.stubEnv("UNSEEN_CAMPAIGNS_DIR", campaignsDir);
  vi.resetModules();

  const mod = await import("../services/campaign-manager.js");
  CampaignManager = mod.CampaignManager;
});

let manager: InstanceType<typeof CampaignManager>;

beforeEach(() => {
  manager = new CampaignManager();
  // Each test gets a fresh campaign to keep scratch / log paths isolated.
  manager.createCampaign("Standing Crew " + Math.random().toString(36).slice(2, 8));
});

// ──────────────────────────────────────────────────────────────────────────
// 1. Turn-log round-trip
// ──────────────────────────────────────────────────────────────────────────

describe("appendTurnLog + readTurnLog", () => {
  it("round-trips: appended content is readable verbatim", () => {
    manager.appendTurnLog("goblin-ambush", "## Round 1\n");
    manager.appendTurnLog("goblin-ambush", "- **Grixx**: Multiattack on Theron → miss, miss.\n");

    const log = manager.readTurnLog("goblin-ambush");
    expect(log).not.toBeNull();
    expect(log!).toContain("# Turn Log — goblin-ambush"); // auto-injected H1
    expect(log!).toContain("## Round 1");
    expect(log!).toContain("Multiattack on Theron");
  });

  it("returns null when no log file exists", () => {
    expect(manager.readTurnLog("never-written")).toBeNull();
  });

  it("trims to the last N rounds when lastNRounds is set", () => {
    for (let r = 1; r <= 5; r++) {
      manager.appendTurnLog("multi", `## Round ${r}\n`);
      manager.appendTurnLog("multi", `- entry for round ${r}\n`);
    }
    const tail = manager.readTurnLog("multi", 2);
    expect(tail).not.toBeNull();
    // Last 2 rounds = Round 4 + Round 5; should NOT contain Round 1, 2, 3 markers
    expect(tail!).toContain("## Round 4");
    expect(tail!).toContain("## Round 5");
    expect(tail!).not.toContain("## Round 1\n");
    expect(tail!).not.toContain("## Round 2\n");
    expect(tail!).not.toContain("## Round 3\n");
    // Should still keep the H1 for context
    expect(tail!).toContain("# Turn Log — multi");
  });

  it("returns the whole log when lastNRounds exceeds total rounds", () => {
    manager.appendTurnLog("short", "## Round 1\n- one entry\n");
    const all = manager.readTurnLog("short", 10);
    expect(all).toContain("## Round 1");
    expect(all).toContain("one entry");
  });

  it("rejects an invalid slug (path-traversal defense)", () => {
    expect(() => manager.appendTurnLog("../escape", "x")).toThrow();
    expect(() => manager.appendTurnLog("UPPERCASE", "x")).toThrow();
    expect(() => manager.appendTurnLog("with spaces", "x")).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. archiveTurnLog
// ──────────────────────────────────────────────────────────────────────────

describe("archiveTurnLog", () => {
  it("renames <slug>.md → <slug>.archive.md", () => {
    manager.appendTurnLog("end-test", "## Round 1\n- something\n");
    manager.archiveTurnLog("end-test");

    expect(manager.readTurnLog("end-test")).toBeNull(); // active is gone
    const archivePath = path.join(
      campaignsDir,
      manager.activeSlug!,
      "dm",
      "encounter-logs",
      "end-test.archive.md",
    );
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(fs.readFileSync(archivePath, "utf-8")).toContain("Round 1");
  });

  it("appends to existing archive on re-engagement", () => {
    // First engagement
    manager.appendTurnLog("re-eng", "## Round 1\n- first run\n");
    manager.archiveTurnLog("re-eng");

    // Second engagement, same slug (e.g. recurring boss)
    manager.appendTurnLog("re-eng", "## Round 1\n- second run\n");
    manager.archiveTurnLog("re-eng");

    const archivePath = path.join(
      campaignsDir,
      manager.activeSlug!,
      "dm",
      "encounter-logs",
      "re-eng.archive.md",
    );
    const content = fs.readFileSync(archivePath, "utf-8");
    expect(content).toContain("first run");
    expect(content).toContain("second run");
    expect(content).toContain("---"); // separator between engagements
  });

  it("is a no-op if no live log exists", () => {
    // Should not throw
    manager.archiveTurnLog("nothing-to-archive");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Session scratch
// ──────────────────────────────────────────────────────────────────────────

describe("session scratch", () => {
  it("is scoped to the active session number (sessionCount + 1)", () => {
    manager.appendSessionScratch("- met Brogan the smith\n");
    const content = manager.readSessionScratch();
    expect(content).toContain("# Session 1 — Scratch"); // first session
    expect(content).toContain("Brogan the smith");

    // The file lives under dm/session-scratch/session-001.md
    const scratchPath = path.join(
      campaignsDir,
      manager.activeSlug!,
      "dm",
      "session-scratch",
      "session-001.md",
    );
    expect(fs.existsSync(scratchPath)).toBe(true);
  });

  it("returns null when no scratch has been written this session", () => {
    expect(manager.readSessionScratch()).toBeNull();
  });

  it("is cleared at endSession (the summary supersedes it)", () => {
    manager.appendSessionScratch("- one beat\n");
    expect(manager.readSessionScratch()).not.toBeNull();

    manager.endSession("Session 1 summary.", "Active context after session 1.");
    // After endSession, sessionCount becomes 1; the *just-ended* session-001.md
    // should be deleted, and readSessionScratch resolves against session-002.md.
    expect(manager.readSessionScratch()).toBeNull();

    const oldScratch = path.join(
      campaignsDir,
      manager.activeSlug!,
      "dm",
      "session-scratch",
      "session-001.md",
    );
    expect(fs.existsSync(oldScratch)).toBe(false);
  });

  it("appends across multiple writes within the same session", () => {
    manager.appendSessionScratch("- first beat\n");
    manager.appendSessionScratch("- second beat\n");
    const content = manager.readSessionScratch();
    expect(content).toContain("first beat");
    expect(content).toContain("second beat");
  });
});
