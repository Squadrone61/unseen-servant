/**
 * CLI mode — interactive launcher that spawns Claude Code with the MCP bridge.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { spawn, execSync } from "child_process";
import {
  DM_CORE_PROMPT,
  DM_SKILL_PLAYER_IDENTITY,
  DM_SKILL_RULES,
  NATIVE_SKILL_RECAP,
  NATIVE_SKILL_NPC_VOICE,
  NATIVE_SKILL_STORY_ARC,
  NATIVE_SKILL_LOOT_DROP,
  NATIVE_SKILL_TAVERN,
  NATIVE_SKILL_BATTLE_TACTICS,
  NATIVE_SKILL_TRAVEL,
  NATIVE_SKILL_TRAP,
  NATIVE_SKILL_PUZZLE,
} from "@unseen-servant/shared";

declare const UNSEEN_VERSION: string;
declare const PRODUCTION_WORKER_URL: string;

const VERSION = typeof UNSEEN_VERSION !== "undefined" ? UNSEEN_VERSION : "dev";

const DEFAULT_WORKER_URL =
  typeof PRODUCTION_WORKER_URL !== "undefined" ? PRODUCTION_WORKER_URL : "http://127.0.0.1:8787";

const BANNER = `
╔══════════════════════════════════════════════════╗
║          Unseen Servant  v${VERSION.padEnd(10)}          ║
║        D&D 5e — Powered by Claude Code           ║
╚══════════════════════════════════════════════════╝
`;

/** Native Claude Code skills — user-invocable slash commands written to .claude/skills/ */
const NATIVE_SKILLS: Record<string, string> = {
  recap: NATIVE_SKILL_RECAP,
  "npc-voice": NATIVE_SKILL_NPC_VOICE,
  "story-arc": NATIVE_SKILL_STORY_ARC,
  "loot-drop": NATIVE_SKILL_LOOT_DROP,
  tavern: NATIVE_SKILL_TAVERN,
  "battle-tactics": NATIVE_SKILL_BATTLE_TACTICS,
  travel: NATIVE_SKILL_TRAVEL,
  trap: NATIVE_SKILL_TRAP,
  puzzle: NATIVE_SKILL_PUZZLE,
};

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function findArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function checkClaudeCli(): boolean {
  try {
    execSync("claude --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function buildClaudeMd(): string {
  return `${DM_CORE_PROMPT}

${DM_SKILL_PLAYER_IDENTITY}

${DM_SKILL_RULES}

## Dynamic System Prompt

The \`systemPrompt\` field in each \`wait_for_message\` response contains contextual DM instructions (combat vs exploration mode, campaign notes, host overrides). These change based on game state — **follow them closely**. When it says "[No changes to DM instructions.]", continue following the last set of instructions you received.

## Slash Commands

Use these slash commands for DM creative workflows and prep:

- \`/recap\` — Narrate story-so-far from campaign notes
- \`/npc-voice\` — Generate an NPC with personality, speech patterns, and secrets
- \`/story-arc\` — Design a multi-session story arc (DM-only planning)
- \`/loot-drop\` — Generate contextual loot for an encounter
- \`/tavern\` — Generate a tavern or shop with NPCs, rumors, and atmosphere
- \`/battle-tactics\` — Monster AI tactical advisor (combat only, DM-only)
- \`/travel\` — Overland travel with pace, encounters, and weather
- \`/trap\` — Design a trap with detection, disarm, and effects
- \`/puzzle\` — Design a puzzle with hints, solution, and resolution`;
}

export async function startCli(): Promise<void> {
  console.log(BANNER);

  if (!checkClaudeCli()) {
    console.error(
      "Error: 'claude' CLI not found in PATH.\n" +
        "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview\n" +
        "  npm install -g @anthropic-ai/claude-code",
    );
    process.exit(1);
  }

  // Parse CLI args (falls back to interactive prompt for room code + model)
  let roomCode = findArg("--room");
  let model = findArg("--model") || "sonnet";
  const workerUrl = findArg("--worker-url") || process.env.UNSEEN_WORKER_URL || DEFAULT_WORKER_URL;
  const campaignName = findArg("--campaign");

  if (!roomCode) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    roomCode = (await prompt(rl, "Room code: ")).trim().toUpperCase();
    if (!roomCode) {
      console.error("Error: Room code is required.");
      process.exit(1);
    }
    const modelInput = (await prompt(rl, `Model [${model}] (sonnet/opus/haiku): `)).trim();
    if (modelInput) model = modelInput.toLowerCase();
    rl.close();
  }

  // Work dir = script's directory (campaigns, sessions, skills all persist here)
  const scriptPath = path.resolve(process.argv[1]);
  const workDir = path.dirname(scriptPath);
  const campaignsDir = path.join(workDir, ".unseen", "campaigns");
  const sessionsDir = path.join(workDir, ".unseen", "sessions");

  // Write native Claude Code skills
  for (const [name, content] of Object.entries(NATIVE_SKILLS)) {
    const skillDir = path.join(workDir, ".claude", "skills", name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  }

  // Write .mcp.json (use "node" directly — cmd eats stdin)
  fs.mkdirSync(campaignsDir, { recursive: true });
  fs.writeFileSync(
    path.join(workDir, ".mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          "unseen-servant": {
            command: "node",
            args: [scriptPath, "--serve"],
            env: {
              UNSEEN_ROOM_CODE: roomCode,
              UNSEEN_CAMPAIGNS_DIR: campaignsDir,
              UNSEEN_WORKER_URL: workerUrl,
            },
          },
        },
      },
      null,
      2,
    ),
  );

  // Write CLAUDE.md
  fs.writeFileSync(path.join(workDir, "CLAUDE.md"), buildClaudeMd());

  // Detect resume vs new campaign
  const isResume = campaignName && fs.existsSync(path.join(sessionsDir, campaignName));

  // Print launch info
  console.log(`Room:       ${roomCode}`);
  console.log(`Model:      ${model}`);
  console.log(`Worker:     ${workerUrl}`);
  console.log(`Campaigns:  ${campaignsDir}`);
  console.log(`Work dir:   ${workDir}`);
  if (campaignName)
    console.log(`Campaign:   ${campaignName}${isResume ? " (resuming)" : " (new)"}`);
  console.log("\nLaunching Claude Code...\n");

  // Build Claude Code args
  const claudeArgs = [
    "--mcp-config",
    path.join(workDir, ".mcp.json"),
    "--model",
    model,
    "--system-prompt",
    "You are the Unseen Servant. Follow all instructions in CLAUDE.md. Begin by calling wait_for_message.",
    "--allowedTools",
    "mcp__unseen-servant__*",
  ];

  if (campaignName && isResume) {
    claudeArgs.push("--resume", campaignName, "--name", campaignName);
  } else if (campaignName) {
    claudeArgs.push("--name", campaignName);
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, campaignName), "");
  }

  claudeArgs.push(
    "--",
    "Start the DM game loop. Call wait_for_message now and keep looping. ALL narrative output MUST go through send_response — never output text directly.",
  );

  // Spawn Claude Code
  const claude = spawn("claude", claudeArgs, { cwd: workDir, stdio: "inherit" });
  claude.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => claude.kill("SIGINT"));
  process.on("SIGTERM", () => claude.kill("SIGTERM"));
}
