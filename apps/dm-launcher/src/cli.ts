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
  "combat-setup": NATIVE_SKILL_COMBAT_SETUP,
  "short-rest": NATIVE_SKILL_SHORT_REST,
  "long-rest": NATIVE_SKILL_LONG_REST,
  recap: NATIVE_SKILL_RECAP,
  "npc-voice": NATIVE_SKILL_NPC_VOICE,
  "story-arc": NATIVE_SKILL_STORY_ARC,
  "loot-drop": NATIVE_SKILL_LOOT_DROP,
  tavern: NATIVE_SKILL_TAVERN,
  "level-up": NATIVE_SKILL_LEVEL_UP,
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
- \`/battle-tactics\` — Monster AI tactical advisor (combat only, DM-only)
- \`/travel\` — Overland travel with pace, encounters, and weather
- \`/trap\` — Design a trap with detection, disarm, and effects
- \`/puzzle\` — Design a puzzle with hints, solution, and resolution`;
}

export async function startCli(): Promise<void> {
  console.log(BANNER);

  // Check that Claude CLI is available
  if (!checkClaudeCli()) {
    console.error(
      "Error: 'claude' CLI not found in PATH.\n" +
        "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview\n" +
        "  npm install -g @anthropic-ai/claude-code",
    );
    process.exit(1);
  }

  // Get room code and model from args or interactive prompt
  let roomCode = findArg("--room");
  let model = findArg("--model") || "sonnet";
  const workerUrl = findArg("--worker-url") || process.env.UNSEEN_WORKER_URL || DEFAULT_WORKER_URL;

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

    const modelInput = await prompt(rl, `Model [${model}] (sonnet/opus/haiku): `);
    if (modelInput.trim()) {
      model = modelInput.trim().toLowerCase();
    }

    rl.close();
  }

  // Resolve the path to this script (the bundled .mjs file)
  const scriptPath = path.resolve(process.argv[1]);
  const scriptDir = path.dirname(scriptPath);

  // Use the script's directory as the working directory
  // Campaigns, Claude sessions, and skills all persist here
  const workDir = scriptDir;

  // Create native Claude Code skills (.claude/skills/<name>/SKILL.md)
  for (const [name, content] of Object.entries(NATIVE_SKILLS)) {
    const skillDir = path.join(workDir, ".claude", "skills", name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  }

  // Campaigns persist alongside the launcher
  const campaignsDir = path.join(workDir, ".unseen", "campaigns");
  fs.mkdirSync(campaignsDir, { recursive: true });

  // Write .mcp.json — command points to this script with --serve
  // Note: always use "node" directly, not "cmd /c node" — cmd eats stdin
  const mcpConfig = {
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
  };

  fs.writeFileSync(path.join(workDir, ".mcp.json"), JSON.stringify(mcpConfig, null, 2));

  // Write CLAUDE.md — slim core prompt + skill file index
  fs.writeFileSync(path.join(workDir, "CLAUDE.md"), buildClaudeMd());

  console.log(`Room:       ${roomCode}`);
  console.log(`Model:      ${model}`);
  console.log(`Worker:     ${workerUrl}`);
  console.log(`Campaigns:  ${campaignsDir}`);
  console.log(`Work dir:   ${workDir}`);
  console.log("");
  console.log("Launching Claude Code...\n");

  // Spawn Claude Code with core DM system prompt (replaces default coding assistant prompt)
  // Auto-allow all unseen-servant MCP tools so the DM can run without permission prompts
  const claude = spawn(
    "claude",
    [
      "--mcp-config",
      path.join(workDir, ".mcp.json"),
      "--model",
      model,
      "--system-prompt",
      "You are the Unseen Servant. Follow all instructions in CLAUDE.md. Begin by calling wait_for_message.",
      "--tools",
      "",
      "--allowedTools",
      [
        // Game communication
        "mcp__unseen-servant__wait_for_message",
        "mcp__unseen-servant__send_response",
        "mcp__unseen-servant__acknowledge",
        "mcp__unseen-servant__get_players",
        "mcp__unseen-servant__get_game_state",
        "mcp__unseen-servant__get_character",
        // HP & conditions
        "mcp__unseen-servant__apply_damage",
        "mcp__unseen-servant__heal",
        "mcp__unseen-servant__set_hp",
        "mcp__unseen-servant__add_condition",
        "mcp__unseen-servant__remove_condition",
        // Combat management
        "mcp__unseen-servant__start_combat",
        "mcp__unseen-servant__end_combat",
        "mcp__unseen-servant__advance_turn",
        "mcp__unseen-servant__add_combatant",
        "mcp__unseen-servant__remove_combatant",
        "mcp__unseen-servant__move_combatant",
        // Spell slots & class resources
        "mcp__unseen-servant__use_spell_slot",
        "mcp__unseen-servant__restore_spell_slot",
        "mcp__unseen-servant__use_class_resource",
        "mcp__unseen-servant__restore_class_resource",
        // Heroic Inspiration
        "mcp__unseen-servant__grant_inspiration",
        "mcp__unseen-servant__use_inspiration",
        // Rest tools
        "mcp__unseen-servant__short_rest",
        "mcp__unseen-servant__long_rest",
        // Death saves
        "mcp__unseen-servant__death_save",
        // Concentration
        "mcp__unseen-servant__set_concentration",
        "mcp__unseen-servant__break_concentration",
        // Temp HP
        "mcp__unseen-servant__set_temp_hp",
        // Inventory & currency
        "mcp__unseen-servant__add_item",
        "mcp__unseen-servant__update_item",
        "mcp__unseen-servant__remove_item",
        "mcp__unseen-servant__update_currency",
        // Battle map
        "mcp__unseen-servant__update_battle_map",
        // D&D reference
        "mcp__unseen-servant__lookup_spell",
        "mcp__unseen-servant__lookup_monster",
        "mcp__unseen-servant__lookup_condition",
        "mcp__unseen-servant__lookup_magic_item",
        "mcp__unseen-servant__lookup_feat",
        "mcp__unseen-servant__lookup_class",
        "mcp__unseen-servant__lookup_species",
        "mcp__unseen-servant__lookup_background",
        "mcp__unseen-servant__search_rules",
        "mcp__unseen-servant__lookup_optional_feature",
        "mcp__unseen-servant__lookup_action",
        "mcp__unseen-servant__lookup_language",
        "mcp__unseen-servant__lookup_disease",
        "mcp__unseen-servant__roll_dice",
        // Context management
        "mcp__unseen-servant__compact_history",
        // Campaign persistence
        "mcp__unseen-servant__create_campaign",
        "mcp__unseen-servant__list_campaigns",
        "mcp__unseen-servant__load_campaign_context",
        "mcp__unseen-servant__save_campaign_file",
        "mcp__unseen-servant__read_campaign_file",
        "mcp__unseen-servant__list_campaign_files",
        "mcp__unseen-servant__end_session",
        "mcp__unseen-servant__calculate_encounter_difficulty",
      ].join(","),
      "--",
      "Start the DM game loop. Call wait_for_message now and keep looping. ALL narrative output MUST go through send_response — never output text directly.",
    ],
    {
      cwd: workDir,
      stdio: "inherit",
    },
  );

  claude.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    claude.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    claude.kill("SIGTERM");
  });
}
