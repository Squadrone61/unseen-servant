import * as fs from "fs";
import * as path from "path";
import { log } from "../logger.js";
import type { CampaignManager } from "./campaign-manager.js";

type LogCategory = "PLAYER" | "DM" | "TOOL" | "EVENT" | "ERROR" | "SESSION" | "SYSTEM";

interface LogEntry {
  ts: string;
  cat: LogCategory;
  msg: string;
  data?: Record<string, unknown>;
}

const CAMPAIGNS_ROOT =
  process.env.UNSEEN_CAMPAIGNS_DIR || path.join(process.cwd(), ".unseen", "campaigns");

/**
 * Append-only JSONL game logger for post-session analysis.
 * Writes to `.unseen/campaigns/{slug}/sessions/game-session-{NNN}.log`.
 * No-ops gracefully when no session is active.
 */
export class GameLogger {
  private campaignManager: CampaignManager;
  private stream: fs.WriteStream | null = null;

  constructor(campaignManager: CampaignManager) {
    this.campaignManager = campaignManager;
  }

  // ─── Core ───

  private write(cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
    if (!this.stream) return;
    const entry: LogEntry = { ts: new Date().toISOString(), cat, msg: msg.replace(/\n/g, "\\n") };
    if (data) entry.data = data;
    this.stream.write(JSON.stringify(entry) + "\n");
  }

  // ─── Session Lifecycle ───

  sessionStart(campaignSlug: string, sessionNumber: number): void {
    // Close any existing stream
    this.stream?.end();
    this.stream = null;

    const sessionDir = path.join(CAMPAIGNS_ROOT, campaignSlug, "sessions");
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const pad = String(sessionNumber).padStart(3, "0");
    const logPath = path.join(sessionDir, `game-session-${pad}.log`);

    this.stream = fs.createWriteStream(logPath, { flags: "a" });
    this.stream.on("error", (err) => {
      log("game-logger", `Write stream error: ${err.message}`);
      this.stream = null;
    });

    log("game-logger", `Logging to ${logPath}`);
    this.write("SESSION", "Session started", { campaign: campaignSlug, session: sessionNumber });
  }

  sessionEnd(campaignSlug: string): void {
    this.write("SESSION", "Session ended", { campaign: campaignSlug });
    this.stream?.end();
    this.stream = null;
  }

  // ─── Game Events ───

  playerMessage(playerName: string, characterName: string | undefined, content: string): void {
    const speaker = characterName ? `${playerName} (${characterName})` : playerName;
    this.write("PLAYER", `${speaker}: ${content}`);
  }

  dmResponse(text: string): void {
    const preview = text.length > 300 ? text.slice(0, 300) + "..." : text;
    this.write("DM", preview, { length: text.length });
  }

  toolCall(toolName: string, args: Record<string, unknown>, resultText: string): void {
    const result = resultText.length > 200 ? resultText.slice(0, 200) + "..." : resultText;
    this.write("TOOL", toolName, { args, result });
  }

  gameEvent(type: string, description: string): void {
    this.write("EVENT", `${type}: ${description}`, { type });
  }

  error(source: string, message: string): void {
    this.write("ERROR", `${source}: ${message}`);
  }

  system(message: string): void {
    this.write("SYSTEM", message);
  }

  // ─── Cleanup ───

  close(): void {
    this.stream?.end();
    this.stream = null;
  }
}
