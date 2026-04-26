import * as fs from "fs";
import * as path from "path";
import { log } from "../logger.js";
import { campaignManifestSchema } from "../types.js";
import type { CampaignManifest, CampaignSummary } from "../types.js";
import { characterSnapshotSchema, encounterBundleSchema } from "@unseen-servant/shared/schemas";
import type { CharacterData, EncounterBundle } from "@unseen-servant/shared/types";

const CAMPAIGNS_ROOT =
  process.env.UNSEEN_CAMPAIGNS_DIR || path.join(process.cwd(), ".unseen", "campaigns");

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
 * Each campaign is a folder under `.unseen/campaigns/{slug}/`.
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
      "utf-8",
    );

    // Create per-entity world directories (files are created per-entity during play)
    for (const category of ["npcs", "locations", "quests", "factions", "items"]) {
      this.ensureDir(path.join(dir, "world", category));
    }

    // DM-private planning directory
    this.ensureDir(path.join(dir, "dm"));

    // Specialist-scoped scratch directories (agents write into their own namespace)
    // rules-advisor is seeded because cross-session ruling consistency is a core feature.
    // Other specialists get their dirs lazily via save_campaign_file.
    this.ensureDir(path.join(dir, "agents", "rules-advisor"));
    fs.writeFileSync(
      path.join(dir, "agents", "rules-advisor", "rulings.md"),
      "# Rulings Log\n\n" +
        "Append one entry per ambiguous ruling this session. Read this file BEFORE ruling on anything\n" +
        "that sounds familiar so session-7's ruling matches session-2's.\n\n" +
        "## Format\n\n" +
        "### Session N — <Date> — <Subject>\n" +
        "- **Question:** <restated question>\n" +
        "- **Answer:** <yes / no / depends>\n" +
        "- **Reasoning:** <short summary>\n" +
        "- **Citations:** <sources>\n\n",
      "utf-8",
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
      const manifestPath = path.join(CAMPAIGNS_ROOT, entry.name, "campaign.json");
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const result = campaignManifestSchema.safeParse(raw);
        if (result.success) {
          const summary: CampaignSummary = {
            slug: result.data.slug,
            name: result.data.name,
            lastPlayedAt: result.data.lastPlayedAt,
            sessionCount: result.data.sessionCount,
          };
          if (result.data.pacingProfile) summary.pacingProfile = result.data.pacingProfile;
          if (result.data.encounterLength) summary.encounterLength = result.data.encounterLength;
          // Read system-prompt.md if it exists and is non-empty
          const promptPath = path.join(CAMPAIGNS_ROOT, entry.name, "system-prompt.md");
          if (fs.existsSync(promptPath)) {
            const promptContent = fs.readFileSync(promptPath, "utf-8").trim();
            if (promptContent) summary.customPrompt = promptContent;
          }
          campaigns.push(summary);
        } else {
          log("campaign-mgr", `Corrupt manifest in ${entry.name}: ${result.error.message}`);
        }
      } catch (e) {
        log(
          "campaign-mgr",
          `Failed to read manifest in ${entry.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return campaigns.sort(
      (a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime(),
    );
  }

  /** Read a file from the active campaign. Path is relative, e.g. "world/npcs". */
  readFile(relativePath: string): string | null {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const normalized = this.validatePath(relativePath);

    // Try with .md extension first, then .json, then exact
    const basePath = path.join(this.activeDir, normalized);
    for (const candidate of [`${basePath}.md`, `${basePath}.json`, basePath]) {
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

  // ─── Encounter Bundles ───
  // Persistent artifact written by encounter-designer at /combat-prep time
  // and read by combat-resolver each turn. See plans/encounter-bundle.md.

  /** Save an encounter bundle to dm/encounters/<slug>.json. Validates against the schema. */
  saveEncounterBundle(bundle: EncounterBundle): string {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const validated = encounterBundleSchema.parse(bundle);
    const dir = path.join(this.activeDir, "dm", "encounters");
    this.ensureDir(dir);
    const filePath = path.join(dir, `${validated.slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(validated, null, 2), "utf-8");
    return path.relative(this.activeDir, filePath);
  }

  /** Load an encounter bundle by slug. Returns null if it doesn't exist. */
  loadEncounterBundle(slug: string): EncounterBundle | null {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const filePath = path.join(this.activeDir, "dm", "encounters", `${slug}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return encounterBundleSchema.parse(raw);
  }

  /** List all encounter bundles in this campaign with light metadata. */
  listEncounterBundles(): { slug: string; createdAt: string; difficulty: string }[] {
    if (!this.activeDir) return [];
    const dir = path.join(this.activeDir, "dm", "encounters");
    if (!fs.existsSync(dir)) return [];
    const out: { slug: string; createdAt: string; difficulty: string }[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
        if (raw.slug && raw.createdAt && raw.difficulty) {
          out.push({ slug: raw.slug, createdAt: raw.createdAt, difficulty: raw.difficulty });
        }
      } catch {
        // Skip malformed bundles
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    characters: Record<string, CharacterData>,
    userIds?: Record<string, string | undefined>,
  ): number {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const charDir = path.join(this.activeDir, "characters");
    this.ensureDir(charDir);

    let count = 0;
    for (const [playerName, charData] of Object.entries(characters)) {
      const slug = slugify(charData.static?.name || playerName);
      const userId = userIds?.[playerName];
      fs.writeFileSync(
        path.join(charDir, `${slug}.json`),
        JSON.stringify({ playerName, ...(userId ? { userId } : {}), ...charData }, null, 2),
        "utf-8",
      );
      count++;
    }
    return count;
  }

  /** Load character snapshots from campaign's characters/ folder.
   *  Returns a map of playerName → CharacterData for restoring into game state. */
  loadCharacterSnapshots(): Record<string, CharacterData> {
    return this.loadCharacterSnapshotsWithIds().characters;
  }

  /**
   * Load character snapshots with userId mappings for stable identity matching.
   *
   * Each file is validated via characterSnapshotSchema.safeParse. Invalid files
   * (corrupt JSON or structurally wrong) are logged and skipped — never silently
   * coerced to unknown. Valid files return fully-typed CharacterStaticData and
   * CharacterDynamicData so callers can rely on the type contract at runtime.
   *
   * Invariant: the write path (snapshotCharacters) is trusted to produce
   * structurally valid files; validation here guards against manually-edited or
   * migrated files that may be missing required fields.
   */
  loadCharacterSnapshotsWithIds(): {
    characters: Record<string, CharacterData>;
    userIds: Record<string, string>;
  } {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const charDir = path.join(this.activeDir, "characters");
    if (!fs.existsSync(charDir)) return { characters: {}, userIds: {} };

    const characters: Record<string, CharacterData> = {};
    const userIds: Record<string, string> = {};
    const charFiles = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));

    for (const file of charFiles) {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(path.join(charDir, file), "utf-8"));
      } catch (e) {
        console.warn(
          `[campaign] Invalid character snapshot '${file}': ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }

      const result = characterSnapshotSchema.safeParse(raw);
      if (!result.success) {
        console.warn(`[campaign] Invalid character snapshot '${file}': ${result.error.message}`);
        continue;
      }

      const { playerName, userId, builder, static: staticData, dynamic: dynamicData } = result.data;
      // Use saved playerName, fall back to character name from static data
      const key = playerName || staticData.name || file.replace(".json", "");
      characters[key] = { builder, static: staticData, dynamic: dynamicData };
      if (userId && key) {
        userIds[key] = userId;
      }
    }
    return { characters, userIds };
  }

  /**
   * Compact startup context — for the conductor session and most per-turn reloads.
   * Loads: manifest summary + system prompt + active-context.md + character summaries
   * + last 2 session summaries. Skips full world/dm folders (specialists pull those on demand).
   * Target: ~3-5k tokens even for long campaigns.
   */
  getCompactContext(): string {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const parts: string[] = [];

    // 1. Manifest
    const manifest = this.cachedManifest;
    if (manifest) {
      parts.push(
        `## Campaign: ${manifest.name}\n` +
          `- Sessions played: ${manifest.sessionCount}\n` +
          `- Players: ${manifest.players.length > 0 ? manifest.players.join(", ") : "none yet"}\n` +
          `- Last played: ${manifest.lastPlayedAt}\n`,
      );
    }

    // 2. System prompt
    const systemPromptPath = path.join(this.activeDir, "system-prompt.md");
    if (fs.existsSync(systemPromptPath)) {
      const prompt = fs.readFileSync(systemPromptPath, "utf-8").trim();
      if (prompt) parts.push(`## DM Instructions\n\n${prompt}`);
    }

    // 3. Active context — the single most important file
    const activeContextPath = path.join(this.activeDir, "active-context.md");
    if (fs.existsSync(activeContextPath)) {
      const ctx = fs.readFileSync(activeContextPath, "utf-8").trim();
      if (ctx) parts.push(`## Current State\n\n${ctx}`);
    }

    // 4. Last 2 session summaries (newest first)
    const sessionsDir = path.join(this.activeDir, "sessions");
    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs
        .readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".md") && /^session-\d+\.md$/.test(f))
        .sort()
        .reverse()
        .slice(0, 2);
      if (sessionFiles.length > 0) {
        const summaries: string[] = [];
        for (const file of sessionFiles) {
          const summary = fs.readFileSync(path.join(sessionsDir, file), "utf-8").trim();
          if (summary) {
            const num = parseInt(file.replace("session-", "").replace(".md", ""), 10);
            summaries.push(`### Session ${num || file}\n${summary}`);
          }
        }
        if (summaries.length > 0) {
          parts.push(
            `## Recent Sessions (last 2, newest first — use \`list_campaign_files\` + \`read_campaign_file\` for older ones)\n\n${summaries.join("\n\n")}`,
          );
        }
      }
    }

    // 5. Character summaries (one line each)
    parts.push(...this.characterSummariesSection());

    // 6. Index hint for deep queries
    parts.push(
      `## Deep queries\n\n` +
        `For specific NPCs, locations, factions, quests, items, traps, puzzles, or DM story-arc:\n` +
        `- Dispatch \`/recap <subject>\` or \`/story-arc <query>\` (both fork to lorekeeper)\n` +
        `- Or call \`list_campaign_files\` to browse, then \`read_campaign_file\` for specific files.\n` +
        `Avoid loading full scope unless you need a session-start deep review.`,
    );

    return parts.join("\n\n---\n\n");
  }

  /**
   * Specialist-scoped context: manifest + active-context + the specialist's own agents/<name>/ folder.
   * Small and focused so the specialist can cross-reference its prior runs.
   */
  getAgentContext(agentName: string): string {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const parts: string[] = [];

    const manifest = this.cachedManifest;
    if (manifest) {
      parts.push(`## Campaign: ${manifest.name} — session ${manifest.sessionCount + 1}`);
    }

    const activeContextPath = path.join(this.activeDir, "active-context.md");
    if (fs.existsSync(activeContextPath)) {
      const ctx = fs.readFileSync(activeContextPath, "utf-8").trim();
      if (ctx) parts.push(`## Current State\n\n${ctx}`);
    }

    const agentDir = path.join(this.activeDir, "agents", agentName);
    if (fs.existsSync(agentDir) && fs.statSync(agentDir).isDirectory()) {
      const files = fs
        .readdirSync(agentDir)
        .filter((f) => f.endsWith(".md"))
        .sort();
      if (files.length > 0) {
        const entries: string[] = [];
        for (const file of files) {
          const content = fs.readFileSync(path.join(agentDir, file), "utf-8").trim();
          if (content) entries.push(`### ${file}\n${content}`);
        }
        if (entries.length > 0) {
          parts.push(`## Specialist notes (agents/${agentName}/)\n\n${entries.join("\n\n")}`);
        }
      }
    }

    return parts.join("\n\n---\n\n");
  }

  /** Character summary lines — shared between compact and full context builders. */
  private characterSummariesSection(): string[] {
    if (!this.activeDir) return [];
    const parts: string[] = [];
    const charDir = path.join(this.activeDir, "characters");
    if (fs.existsSync(charDir)) {
      const charFiles = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));
      if (charFiles.length > 0) {
        const charSummaries: string[] = [];
        for (const file of charFiles) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(charDir, file), "utf-8"));
            const s = data.static;
            const d = data.dynamic;
            const classes = s.classes
              ?.map((c: { name: string; level: number }) => `${c.name} ${c.level}`)
              .join("/");
            charSummaries.push(
              `- **${s.name}** (${s.species || s.race} ${classes}) — HP ${d.currentHP}/${s.maxHP}, AC ${s.armorClass}`,
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
    return parts;
  }

  /**
   * Get the combined startup context for the AI DM.
   * Loads: manifest + system prompt + active context + world notes + DM planning +
   * ALL session summaries (newest first) + character summaries.
   */
  getStartupContext(): string {
    if (!this.activeDir) throw new Error("No campaign loaded");

    const parts: string[] = [];

    // 1. Campaign manifest summary
    const manifest = this.cachedManifest;
    if (manifest) {
      parts.push(
        `## Campaign: ${manifest.name}\n` +
          `- Sessions played: ${manifest.sessionCount}\n` +
          `- Players: ${manifest.players.length > 0 ? manifest.players.join(", ") : "none yet"}\n` +
          `- Last played: ${manifest.lastPlayedAt}\n`,
      );
    }

    // 2. System prompt (DM instructions)
    const systemPromptPath = path.join(this.activeDir, "system-prompt.md");
    if (fs.existsSync(systemPromptPath)) {
      const prompt = fs.readFileSync(systemPromptPath, "utf-8").trim();
      if (prompt) {
        parts.push(`## DM Instructions\n\n${prompt}`);
      }
    }

    // 3. Active context (most important current state)
    const activeContextPath = path.join(this.activeDir, "active-context.md");
    if (fs.existsSync(activeContextPath)) {
      const ctx = fs.readFileSync(activeContextPath, "utf-8").trim();
      if (ctx) {
        parts.push(`## Current State\n\n${ctx}`);
      }
    }

    // 4. World notes (per-entity directories)
    const worldNotes: string[] = [];
    const worldCategories: Array<{ label: string; dir: string }> = [
      { label: "NPCs", dir: "world/npcs" },
      { label: "Locations", dir: "world/locations" },
      { label: "Quests", dir: "world/quests" },
      { label: "Factions", dir: "world/factions" },
      { label: "Notable Items", dir: "world/items" },
    ];
    for (const { label, dir } of worldCategories) {
      const dirPath = path.join(this.activeDir, dir);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const entityFiles = fs
          .readdirSync(dirPath)
          .filter((f) => f.endsWith(".md"))
          .sort();
        if (entityFiles.length > 0) {
          const entries: string[] = [];
          for (const file of entityFiles) {
            const content = fs.readFileSync(path.join(dirPath, file), "utf-8").trim();
            if (content) {
              entries.push(content);
            }
          }
          if (entries.length > 0) {
            worldNotes.push(`### ${label}\n${entries.join("\n\n")}`);
          }
        }
      }
    }
    if (worldNotes.length > 0) {
      parts.push(`## World Notes\n\n${worldNotes.join("\n\n")}`);
    }

    // 5. DM Planning notes (private — never reveal to players)
    const storyArcPath = path.join(this.activeDir, "dm", "story-arc.md");
    if (fs.existsSync(storyArcPath)) {
      const arc = fs.readFileSync(storyArcPath, "utf-8").trim();
      if (arc) {
        parts.push(`## DM Planning (PRIVATE — never reveal to players)\n\n${arc}`);
      }
    }

    // 6. ALL session summaries (newest first)
    const sessionsDir = path.join(this.activeDir, "sessions");
    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs
        .readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse(); // newest first
      if (sessionFiles.length > 0) {
        const sessionSummaries: string[] = [];
        for (const file of sessionFiles) {
          const sessionPath = path.join(sessionsDir, file);
          const summary = fs.readFileSync(sessionPath, "utf-8").trim();
          if (summary) {
            // Extract session number from filename (session-001.md → 1)
            const num = parseInt(file.replace("session-", "").replace(".md", ""), 10);
            sessionSummaries.push(`### Session ${num || file}\n${summary}`);
          }
        }
        if (sessionSummaries.length > 0) {
          parts.push(`## Session History (newest first)\n\n${sessionSummaries.join("\n\n")}`);
        }
      }
    }

    // 7. Character summaries
    const charDir = path.join(this.activeDir, "characters");
    if (fs.existsSync(charDir)) {
      const charFiles = fs.readdirSync(charDir).filter((f) => f.endsWith(".json"));
      if (charFiles.length > 0) {
        const charSummaries: string[] = [];
        for (const file of charFiles) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(charDir, file), "utf-8"));
            const s = data.static;
            const d = data.dynamic;
            const classes = s.classes
              ?.map((c: { name: string; level: number }) => `${c.name} ${c.level}`)
              .join("/");
            charSummaries.push(
              `- **${s.name}** (${s.species || s.race} ${classes}) — HP ${d.currentHP}/${s.maxHP}, AC ${s.armorClass}`,
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
    characters?: Record<string, CharacterData>,
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
    fs.writeFileSync(path.join(sessionsDir, sessionFile), summary, "utf-8");

    // Update active context
    fs.writeFileSync(path.join(this.activeDir, "active-context.md"), activeContext, "utf-8");

    // Snapshot characters if provided
    if (characters) {
      this.snapshotCharacters(characters);

      // Update players list from characters
      this.cachedManifest.players = Object.values(characters).map(
        (c) => c.static?.name || "Unknown",
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
    fs.writeFileSync(path.join(this.activeDir, "system-prompt.md"), prompt, "utf-8");
  }

  /** Update the manifest's lastPlayedAt timestamp. */
  touchManifest(): void {
    if (!this.cachedManifest) return;
    this.cachedManifest.lastPlayedAt = new Date().toISOString();
    this.manifestDirty = true;
  }

  /** Save a player's personal notes. Private — excluded from getStartupContext.
   *  When userId is provided, uses it as the file slug for stable identity across name changes. */
  savePlayerNotes(playerName: string, content: string, userId?: string): void {
    if (!this.activeDir) throw new Error("No campaign loaded");
    const notesDir = path.join(this.activeDir, "notes");
    this.ensureDir(notesDir);
    const slug = userId ?? slugify(playerName);
    fs.writeFileSync(path.join(notesDir, `${slug}.md`), content, "utf-8");
  }

  /** Load a player's personal notes. Returns null if none saved.
   *  Tries userId-based file first, falls back to playerName slug (migration path). */
  loadPlayerNotes(playerName: string, userId?: string): string | null {
    if (!this.activeDir) return null;
    const notesDir = path.join(this.activeDir, "notes");

    // Try userId-based file first
    if (userId) {
      const userIdPath = path.join(notesDir, `${userId}.md`);
      if (fs.existsSync(userIdPath)) return fs.readFileSync(userIdPath, "utf-8");
    }

    // Fall back to playerName slug (guests or legacy notes)
    const namePath = path.join(notesDir, `${slugify(playerName)}.md`);
    if (!fs.existsSync(namePath)) return null;
    return fs.readFileSync(namePath, "utf-8");
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
