import * as fs from "fs";
import * as path from "path";
import { campaignManifestSchema } from "../types.js";
import type { CampaignManifest, CampaignSummary } from "../types.js";

const CAMPAIGNS_ROOT = process.env.AIDND_CAMPAIGNS_DIR || path.join(process.cwd(), ".aidnd", "campaigns");

/** Slugify a campaign name: lowercase, hyphens, no special chars. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Manages campaign persistence on the local filesystem.
 * Each campaign is a folder under `.aidnd/campaigns/{slug}/`.
 */
export class CampaignManager {
  private activeCampaignSlug: string | null = null;
  private cachedManifest: CampaignManifest | null = null;
  private manifestDirty = false;

  /** Get the active campaign slug (null if none loaded). */
  get activeSlug(): string | null {
    return this.activeCampaignSlug;
  }

  /** Get the active campaign directory path. */
  private get activeDir(): string | null {
    if (!this.activeCampaignSlug) return null;
    return path.join(CAMPAIGNS_ROOT, this.activeCampaignSlug);
  }

  /** Validate a relative path to prevent directory traversal. */
  private validatePath(relativePath: string): string {
    // Normalize and remove any leading slashes
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    // Reject paths that try to escape
    if (normalized.includes("..") || path.isAbsolute(normalized)) {
      throw new Error(`Invalid path: ${relativePath}`);
    }
    return normalized;
  }

  /** Ensure a directory exists. */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /** Read and validate a manifest from disk. Strips unknown fields (e.g. old partyLevel, systemPrompt). */
  private readManifestFromDisk(dir: string): CampaignManifest {
    const manifestPath = path.join(dir, "campaign.json");
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return campaignManifestSchema.parse(raw);
  }

  /** Write the cached manifest to disk and clear dirty flag. */
  private writeManifestToDisk(): void {
    if (!this.activeDir || !this.cachedManifest) return;
    const manifestPath = path.join(this.activeDir, "campaign.json");
    fs.writeFileSync(manifestPath, JSON.stringify(this.cachedManifest, null, 2), "utf-8");
    this.manifestDirty = false;
  }

  /** Flush manifest to disk if dirty. Call at critical checkpoints (disconnect, end session). */
  flushManifest(): void {
    if (this.manifestDirty) {
      this.writeManifestToDisk();
    }
  }

  /** Create a new campaign. Returns the manifest. */
  createCampaign(name: string): CampaignManifest {
    // Flush any previous campaign's pending changes
    this.flushManifest();

    const slug = slugify(name);
    if (!slug) throw new Error("Invalid campaign name");

    const dir = path.join(CAMPAIGNS_ROOT, slug);
    if (fs.existsSync(dir)) {
      throw new Error(`Campaign "${slug}" already exists`);
    }

    // Create folder structure
    this.ensureDir(dir);
    this.ensureDir(path.join(dir, "world"));
    this.ensureDir(path.join(dir, "sessions"));
    this.ensureDir(path.join(dir, "characters"));

    const manifest: CampaignManifest = {
      name,
      slug,
      players: [],
      sessionCount: 0,
      createdAt: new Date().toISOString(),
      lastPlayedAt: new Date().toISOString(),
    };

    this.activeCampaignSlug = slug;
    this.cachedManifest = manifest;
    this.manifestDirty = false;
    // Write immediately for new campaigns
    this.writeManifestToDisk();

    // Create empty starter files
    fs.writeFileSync(path.join(dir, "system-prompt.md"), "", "utf-8");
    fs.writeFileSync(
      path.join(dir, "active-context.md"),
      "# Active Context\n\nNew campaign — no context yet.\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(dir, "world", "npcs.md"),
      "# NPCs\n\n_No NPCs recorded yet._\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(dir, "world", "locations.md"),
      "# Locations\n\n_No locations recorded yet._\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(dir, "world", "factions.md"),
      "# Factions\n\n_No factions recorded yet._\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(dir, "world", "quests.md"),
      "# Quests\n\n_No quests recorded yet._\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(dir, "world", "items.md"),
      "# Notable Items\n\n_No items recorded yet._\n",
      "utf-8"
    );

    return manifest;
  }

  /** Load an existing campaign by slug. Returns the manifest. */
  loadCampaign(slug: string): CampaignManifest {
    // Flush any previous campaign's pending changes
    this.flushManifest();

    const dir = path.join(CAMPAIGNS_ROOT, slug);
    if (!fs.existsSync(path.join(dir, "campaign.json"))) {
      throw new Error(`Campaign "${slug}" not found`);
    }

    const manifest = this.readManifestFromDisk(dir);
    this.activeCampaignSlug = slug;
    this.cachedManifest = manifest;
    this.manifestDirty = false;
    return manifest;
  }

  /** List all campaigns on disk. */
  listCampaigns(): CampaignSummary[] {
    if (!fs.existsSync(CAMPAIGNS_ROOT)) {
      return [];
    }

    const entries = fs.readdirSync(CAMPAIGNS_ROOT, { withFileTypes: true });
    const campaigns: CampaignSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(
        CAMPAIGNS_ROOT,
        entry.name,
        "campaign.json"
      );
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const result = campaignManifestSchema.safeParse(raw);
        if (result.success) {
          campaigns.push({
            slug: result.data.slug,
            name: result.data.name,
            lastPlayedAt: result.data.lastPlayedAt,
            sessionCount: result.data.sessionCount,
          });
        } else {
          console.error(`[campaign-manager] Corrupt manifest in ${entry.name}: ${result.error.message}`);
        }
      } catch (e) {
        console.error(`[campaign-manager] Failed to read manifest in ${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return campaigns.sort(
      (a, b) =>
        new Date(b.lastPlayedAt).getTime() -
        new Date(a.lastPlayedAt).getTime()
    );
  }

  /** Read a file from the active campaign. Path is relative, e.g. "world/npcs". */
  readFile(relativePath: string): string | null {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const normalized = this.validatePath(relativePath);

    // Try with .md extension first, then .json, then exact
    const basePath = path.join(this.activeDir, normalized);
    for (const candidate of [
      `${basePath}.md`,
      `${basePath}.json`,
      basePath,
    ]) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, "utf-8");
      }
    }
    return null;
  }

  /** Write a file to the active campaign. Path is relative, e.g. "world/npcs". */
  writeFile(relativePath: string, content: string): string {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const normalized = this.validatePath(relativePath);

    // Add .md extension if no extension provided
    const hasExt = path.extname(normalized) !== "";
    const filePath = hasExt
      ? path.join(this.activeDir, normalized)
      : path.join(this.activeDir, `${normalized}.md`);

    // Ensure parent directory exists
    this.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, "utf-8");

    return path.relative(this.activeDir, filePath);
  }

  /** List all files in the active campaign as a tree. */
  listFiles(): string[] {
    if (!this.activeDir) throw new Error("No campaign loaded");
    if (!fs.existsSync(this.activeDir)) return [];

    const files: string[] = [];
    const walk = (dir: string, prefix: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), rel);
        } else {
          files.push(rel);
        }
      }
    };
    walk(this.activeDir, "");
    return files.sort();
  }

  /** Snapshot character data into the campaign's characters/ folder. */
  snapshotCharacters(
    characters: Record<string, { static: unknown; dynamic: unknown }>
  ): number {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const charDir = path.join(this.activeDir, "characters");
    this.ensureDir(charDir);

    let count = 0;
    for (const [playerName, charData] of Object.entries(characters)) {
      const slug = slugify(
        (charData.static as { name?: string })?.name || playerName
      );
      fs.writeFileSync(
        path.join(charDir, `${slug}.json`),
        JSON.stringify({ playerName, ...charData }, null, 2),
        "utf-8"
      );
      count++;
    }
    return count;
  }

  /** Load character snapshots from campaign's characters/ folder.
   *  Returns a map of playerName → { static, dynamic } for restoring into game state. */
  loadCharacterSnapshots(): Record<string, { static: unknown; dynamic: unknown }> {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const charDir = path.join(this.activeDir, "characters");
    if (!fs.existsSync(charDir)) return {};

    const result: Record<string, { static: unknown; dynamic: unknown }> = {};
    const charFiles = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));

    for (const file of charFiles) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(charDir, file), "utf-8")
        );
        const playerName = data.playerName as string | undefined;
        const charName = (data.static as { name?: string })?.name;
        // Use saved playerName, fall back to character name
        const key = playerName || charName || file.replace(".json", "");
        if (data.static && data.dynamic) {
          result[key] = { static: data.static, dynamic: data.dynamic };
        }
      } catch {
        // skip corrupt files
      }
    }
    return result;
  }

  /**
   * Get the combined startup context for the AI DM.
   * Loads: manifest + system prompt + active context + latest session summary.
   */
  getStartupContext(): string {
    if (!this.activeDir) throw new Error("No campaign loaded");

    const parts: string[] = [];

    // 1. Campaign manifest summary (use cache)
    const manifest = this.cachedManifest;
    if (manifest) {
      parts.push(
        `## Campaign: ${manifest.name}\n` +
          `- Sessions played: ${manifest.sessionCount}\n` +
          `- Players: ${manifest.players.length > 0 ? manifest.players.join(", ") : "none yet"}\n` +
          `- Last played: ${manifest.lastPlayedAt}\n`
      );
    }

    // 2. System prompt
    const systemPromptPath = path.join(this.activeDir, "system-prompt.md");
    if (fs.existsSync(systemPromptPath)) {
      const prompt = fs.readFileSync(systemPromptPath, "utf-8").trim();
      if (prompt) {
        parts.push(`## DM Instructions\n\n${prompt}`);
      }
    }

    // 3. Active context (most important)
    const activeContextPath = path.join(this.activeDir, "active-context.md");
    if (fs.existsSync(activeContextPath)) {
      const ctx = fs.readFileSync(activeContextPath, "utf-8").trim();
      if (ctx) {
        parts.push(ctx);
      }
    }

    // 4. Latest session summary
    const sessionsDir = path.join(this.activeDir, "sessions");
    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs
        .readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".md"))
        .sort();
      if (sessionFiles.length > 0) {
        const latestPath = path.join(
          sessionsDir,
          sessionFiles[sessionFiles.length - 1]
        );
        const summary = fs.readFileSync(latestPath, "utf-8").trim();
        if (summary) {
          parts.push(`## Previous Session Summary\n\n${summary}`);
        }
      }
    }

    // 5. Character summaries
    const charDir = path.join(this.activeDir, "characters");
    if (fs.existsSync(charDir)) {
      const charFiles = fs
        .readdirSync(charDir)
        .filter((f) => f.endsWith(".json"));
      if (charFiles.length > 0) {
        const charSummaries: string[] = [];
        for (const file of charFiles) {
          try {
            const data = JSON.parse(
              fs.readFileSync(path.join(charDir, file), "utf-8")
            );
            const s = data.static;
            const d = data.dynamic;
            const classes = s.classes
              ?.map((c: { name: string; level: number }) => `${c.name} ${c.level}`)
              .join("/");
            charSummaries.push(
              `- **${s.name}** (${s.species || s.race} ${classes}) — HP ${d.currentHP}/${s.maxHP}, AC ${s.armorClass}`
            );
          } catch {
            // skip
          }
        }
        if (charSummaries.length > 0) {
          parts.push(`## Party\n\n${charSummaries.join("\n")}`);
        }
      }
    }

    return parts.join("\n\n---\n\n");
  }

  /**
   * End the current session: write session summary, update active-context,
   * snapshot characters, and increment session count.
   */
  endSession(
    summary: string,
    activeContext: string,
    characters?: Record<string, { static: unknown; dynamic: unknown }>
  ): { sessionNumber: number } {
    if (!this.activeDir || !this.cachedManifest) throw new Error("No campaign loaded");

    // Mutate cache
    this.cachedManifest.sessionCount += 1;
    this.cachedManifest.lastPlayedAt = new Date().toISOString();
    const sessionNumber = this.cachedManifest.sessionCount;

    // Write session summary
    const sessionsDir = path.join(this.activeDir, "sessions");
    this.ensureDir(sessionsDir);
    const sessionFile = `session-${String(sessionNumber).padStart(3, "0")}.md`;
    fs.writeFileSync(
      path.join(sessionsDir, sessionFile),
      summary,
      "utf-8"
    );

    // Update active context
    fs.writeFileSync(
      path.join(this.activeDir, "active-context.md"),
      activeContext,
      "utf-8"
    );

    // Snapshot characters if provided
    if (characters) {
      this.snapshotCharacters(characters);

      // Update players list from characters
      this.cachedManifest.players = Object.values(characters).map(
        (c) => (c.static as { name?: string })?.name || "Unknown"
      );
    }

    // Flush manifest (critical checkpoint)
    this.writeManifestToDisk();

    // Clean up stale session state file
    const sessionStatePath = path.join(this.activeDir, "session-state.json");
    if (fs.existsSync(sessionStatePath)) {
      fs.unlinkSync(sessionStatePath);
    }

    return { sessionNumber };
  }


  /** Save pacing/encounter settings to the manifest. */
  saveSettings(settings: { pacingProfile?: string; encounterLength?: string }): void {
    if (!this.cachedManifest) throw new Error("No campaign loaded");

    if (settings.pacingProfile) this.cachedManifest.pacingProfile = settings.pacingProfile;
    if (settings.encounterLength) this.cachedManifest.encounterLength = settings.encounterLength;

    // Flush immediately — settings are user-initiated
    this.writeManifestToDisk();
  }

  /** Read the system prompt from the active campaign. */
  getSystemPrompt(): string | null {
    if (!this.activeDir) return null;
    const promptPath = path.join(this.activeDir, "system-prompt.md");
    if (!fs.existsSync(promptPath)) return null;
    const content = fs.readFileSync(promptPath, "utf-8").trim();
    return content || null;
  }

  /** Save the system prompt to the active campaign. */
  saveSystemPrompt(prompt: string): void {
    if (!this.activeDir) throw new Error("No campaign loaded");
    fs.writeFileSync(
      path.join(this.activeDir, "system-prompt.md"),
      prompt,
      "utf-8"
    );
  }

  /** Update the manifest's lastPlayedAt timestamp. */
  touchManifest(): void {
    if (!this.cachedManifest) return;
    this.cachedManifest.lastPlayedAt = new Date().toISOString();
    this.manifestDirty = true;
  }

  /** Save a player's personal notes. Private — excluded from getStartupContext. */
  savePlayerNotes(playerName: string, content: string): void {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const notesDir = path.join(this.activeDir, "notes");
    this.ensureDir(notesDir);
    const slug = slugify(playerName);
    fs.writeFileSync(path.join(notesDir, `${slug}.md`), content, "utf-8");
  }

  /** Load a player's personal notes. Returns null if none saved. */
  loadPlayerNotes(playerName: string): string | null {
    if (!this.activeDir) return null;
    const slug = slugify(playerName);
    const notesPath = path.join(this.activeDir, "notes", `${slug}.md`);
    if (!fs.existsSync(notesPath)) return null;
    return fs.readFileSync(notesPath, "utf-8");
  }

  /** Update the players list in the manifest. */
  updatePlayers(playerNames: string[]): void {
    if (!this.cachedManifest) return;
    this.cachedManifest.players = playerNames;
    this.manifestDirty = true;
  }

  /** Get the manifest for the active campaign. */
  getManifest(): CampaignManifest | null {
    return this.cachedManifest;
  }
}
