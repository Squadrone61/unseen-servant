/**
 * CLI mode — interactive launcher that spawns Claude Code with the MCP bridge.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { spawn, execSync } from "child_process";
import { randomBytes } from "crypto";
import {
  DM_CORE_PROMPT,
  NATIVE_SKILL_COMBAT_SETUP,
  NATIVE_SKILL_SHORT_REST,
  NATIVE_SKILL_LONG_REST,
  NATIVE_SKILL_RECAP,
  NATIVE_SKILL_NPC_VOICE,
  NATIVE_SKILL_STORY_ARC,
  NATIVE_SKILL_LOOT_DROP,
  NATIVE_SKILL_TAVERN,
  NATIVE_SKILL_LEVEL_UP,
  NATIVE_SKILL_BATTLE_TACTICS,
} from "@aidnd/shared";

declare const AIDND_VERSION: string;
declare const PRODUCTION_WORKER_URL: string;

const VERSION =
  typeof AIDND_VERSION !== "undefined" ? AIDND_VERSION : "dev";

const DEFAULT_WORKER_URL =
  typeof PRODUCTION_WORKER_URL !== "undefined"
    ? PRODUCTION_WORKER_URL
    : "http://127.0.0.1:8787";

const BANNER = `
╔══════════════════════════════════════════════════╗
║          AI Dungeon Master  v${VERSION.padEnd(10)}          ║
║        D&D 5e — Powered by Claude Code           ║
╚══════════════════════════════════════════════════╝
`;

/** Native Claude Code skills — user-invocable slash commands written to .claude/skills/ */
const NATIVE_SKILLS: Record<string, string> = {
  "combat-setup": NATIVE_SKILL_COMBAT_SETUP,
  "short-rest": NATIVE_SKILL_SHORT_REST,
  "long-rest": NATIVE_SKILL_LONG_REST,
  "recap": NATIVE_SKILL_RECAP,
  "npc-voice": NATIVE_SKILL_NPC_VOICE,
  "story-arc": NATIVE_SKILL_STORY_ARC,
  "loot-drop": NATIVE_SKILL_LOOT_DROP,
  "tavern": NATIVE_SKILL_TAVERN,
  "level-up": NATIVE_SKILL_LEVEL_UP,
  "battle-tactics": NATIVE_SKILL_BATTLE_TACTICS,
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

## Dynamic System Prompt

The \`systemPrompt\` field in each \`wait_for_message\` response contains contextual DM instructions tailored to the current game state (combat vs exploration, campaign active, etc.). **Follow those instructions closely** — they are your primary behavioral guide.

## Slash Commands

Use these slash commands for common DM workflows:

- \`/combat-setup\` — Guided encounter setup with monster lookup, battle map, and initiative
- \`/short-rest\` — Hit Dice healing and class feature recovery
- \`/long-rest\` — Full HP restore, spell slots, condition clearing
- \`/recap\` — Narrate story-so-far from campaign notes
- \`/npc-voice\` — Generate an NPC with personality, speech patterns, and secrets
- \`/story-arc\` — Design a multi-session story arc (DM-only planning)
- \`/loot-drop\` — Generate contextual loot for an encounter
- \`/tavern\` — Generate a tavern or shop with NPCs, rumors, and atmosphere
- \`/level-up\` — Level up assistant with growth narration
- \`/battle-tactics\` — Monster AI tactical advisor (combat only, DM-only)`;
}

export async function startCli(): Promise<void> {
  console.log(BANNER);

  // Check that Claude CLI is available
  if (!checkClaudeCli()) {
    console.error(
      "Error: 'claude' CLI not found in PATH.\n" +
        "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview\n" +
        "  npm install -g @anthropic-ai/claude-code"
    );
    process.exit(1);
  }

  // Get room code and model from args or interactive prompt
  let roomCode = findArg("--room");
  let model = findArg("--model") || "sonnet";
  const workerUrl = findArg("--worker-url") || process.env.AIDND_WORKER_URL || DEFAULT_WORKER_URL;

  if (!roomCode) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    roomCode = await prompt(rl, "Room code: ");
    roomCode = roomCode.trim().toUpperCase();

    if (!roomCode) {
      console.error("Error: Room code is required.");
      process.exit(1);
    }

    const modelInput = await prompt(
      rl,
      `Model [${model}] (sonnet/opus/haiku): `
    );
    if (modelInput.trim()) {
      model = modelInput.trim().toLowerCase();
    }

    rl.close();
  }

  // Resolve the path to this script (the bundled .mjs file)
  const scriptPath = path.resolve(process.argv[1]);

  // Create temp working directory
  const tmpId = randomBytes(4).toString("hex");
  const tmpDir = path.join(os.tmpdir(), `aidnd-dm-${tmpId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Create native Claude Code skills (.claude/skills/<name>/SKILL.md)
  for (const [name, content] of Object.entries(NATIVE_SKILLS)) {
    const skillDir = path.join(tmpDir, ".claude", "skills", name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  }

  // Campaigns persist in ~/.aidnd/campaigns/ (not in the temp dir)
  const campaignsDir = path.join(os.homedir(), ".aidnd", "campaigns");
  fs.mkdirSync(campaignsDir, { recursive: true });

  // Write .mcp.json — command points to this script with --serve
  // Note: always use "node" directly, not "cmd /c node" — cmd eats stdin
  const mcpConfig = {
    mcpServers: {
      "aidnd-dm": {
        command: "node",
        args: [scriptPath, "--serve"],
        env: {
          AIDND_ROOM_CODE: roomCode,
          AIDND_CAMPAIGNS_DIR: campaignsDir,
          AIDND_WORKER_URL: workerUrl,
        },
      },
    },
  };

  fs.writeFileSync(
    path.join(tmpDir, ".mcp.json"),
    JSON.stringify(mcpConfig, null, 2)
  );

  // Write CLAUDE.md — slim core prompt + skill file index
  fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), buildClaudeMd());

  console.log(`Room:       ${roomCode}`);
  console.log(`Model:      ${model}`);
  console.log(`Worker:     ${workerUrl}`);
  console.log(`Campaigns:  ${campaignsDir}`);
  console.log(`Temp dir:   ${tmpDir}`);
  console.log("");
  console.log("Launching Claude Code...\n");

  // Spawn Claude Code with core DM system prompt (replaces default coding assistant prompt)
  // Auto-allow all aidnd-dm MCP tools so the DM can run without permission prompts
  const claude = spawn(
    "claude",
    [
      "--mcp-config",
      path.join(tmpDir, ".mcp.json"),
      "--model",
      model,
      "--system-prompt",
      DM_CORE_PROMPT,
      "--tools",
      "",
      "--allowedTools",
      [
        // Game communication
        "mcp__aidnd-dm__wait_for_message",
        "mcp__aidnd-dm__send_response",
        "mcp__aidnd-dm__acknowledge",
        "mcp__aidnd-dm__get_players",
        "mcp__aidnd-dm__get_game_state",
        "mcp__aidnd-dm__get_character",
        // HP & conditions
        "mcp__aidnd-dm__apply_damage",
        "mcp__aidnd-dm__heal",
        "mcp__aidnd-dm__set_hp",
        "mcp__aidnd-dm__add_condition",
        "mcp__aidnd-dm__remove_condition",
        // Combat management
        "mcp__aidnd-dm__start_combat",
        "mcp__aidnd-dm__end_combat",
        "mcp__aidnd-dm__advance_turn",
        "mcp__aidnd-dm__add_combatant",
        "mcp__aidnd-dm__remove_combatant",
        "mcp__aidnd-dm__move_combatant",
        // Spell slots
        "mcp__aidnd-dm__use_spell_slot",
        "mcp__aidnd-dm__restore_spell_slot",
        // Inventory & currency
        "mcp__aidnd-dm__add_item",
        "mcp__aidnd-dm__remove_item",
        "mcp__aidnd-dm__update_currency",
        // Battle map
        "mcp__aidnd-dm__update_battle_map",
        // D&D reference
        "mcp__aidnd-dm__lookup_spell",
        "mcp__aidnd-dm__lookup_monster",
        "mcp__aidnd-dm__lookup_condition",
        "mcp__aidnd-dm__roll_dice",
        // Context management
        "mcp__aidnd-dm__compact_history",
        // Campaign persistence
        "mcp__aidnd-dm__create_campaign",
        "mcp__aidnd-dm__list_campaigns",
        "mcp__aidnd-dm__load_campaign_context",
        "mcp__aidnd-dm__save_campaign_file",
        "mcp__aidnd-dm__read_campaign_file",
        "mcp__aidnd-dm__list_campaign_files",
        "mcp__aidnd-dm__end_session",
      ].join(","),
      "--",
      "Start the DM game loop. Call wait_for_message now and keep looping.",
    ],
    {
      cwd: tmpDir,
      stdio: "inherit",
    }
  );

  // Clean up on exit
  const cleanup = () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore — temp dir may already be gone
    }
  };

  claude.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    claude.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    claude.kill("SIGTERM");
    cleanup();
  });
}
