/**
 * CLI mode — interactive launcher that spawns Claude Code with the MCP bridge.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { spawn, execSync } from "child_process";

import CLAUDE_MD from "./claude-md.md";

import SKILL_RECAP from "./skills/recap.md";
import SKILL_NPC_VOICE from "./skills/npc-voice.md";
import SKILL_STORY_ARC from "./skills/story-arc.md";
import SKILL_LOOT_DROP from "./skills/loot-drop.md";
import SKILL_TAVERN from "./skills/tavern.md";
import SKILL_TRAVEL from "./skills/travel.md";
import SKILL_TRAP from "./skills/trap.md";
import SKILL_PUZZLE from "./skills/puzzle.md";
import SKILL_BATTLE_TACTICS from "./skills/battle-tactics.md";
import SKILL_COMBAT_PREP from "./skills/combat-prep.md";
import SKILL_COMBAT from "./skills/combat.md";
import SKILL_COMBAT_TURN from "./skills/combat-turn.md";
import SKILL_NARRATION from "./skills/narration.md";
import SKILL_SOCIAL from "./skills/social.md";
import SKILL_RULES from "./skills/rules.md";
import SKILL_CAMPAIGN from "./skills/campaign.md";
import SKILL_RULING from "./skills/ruling.md";

import RULE_INVARIANTS from "./rules/invariants.md";
import RULE_RESPONSE_VS_ACKNOWLEDGE from "./rules/response-vs-acknowledge.md";
import RULE_ACTION_REF from "./rules/action-ref.md";
import RULE_SKILLS_ROUTING from "./rules/skills-routing.md";
import RULE_LOOKUP_BEFORE_NARRATE from "./rules/lookup-before-narrate.md";

import AGENT_COMBAT_RESOLVER from "./agents/combat-resolver.md";
import AGENT_RULES_ADVISOR from "./agents/rules-advisor.md";
import AGENT_ENCOUNTER_DESIGNER from "./agents/encounter-designer.md";
import AGENT_NPC_VOICE from "./agents/npc-voice.md";
import AGENT_SCENE_BUILDER from "./agents/scene-builder.md";
import AGENT_LOREKEEPER from "./agents/lorekeeper.md";

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

/** Native Claude Code skills — model-invocable, written to .claude/skills/<name>/SKILL.md */
const NATIVE_SKILLS: Record<string, string> = {
  // Combat — mixed conductor + fork-skills
  combat: SKILL_COMBAT, // conductor-side reference for player turns + lifecycle
  "combat-prep": SKILL_COMBAT_PREP, // fork → encounter-designer
  "combat-turn": SKILL_COMBAT_TURN, // fork → combat-resolver (NPC turn resolution)
  "battle-tactics": SKILL_BATTLE_TACTICS, // fork → combat-resolver (advice only)
  // Rules arbitration (fork-skill)
  ruling: SKILL_RULING, // fork → rules-advisor
  // Conductor meta-skills (not forked)
  narration: SKILL_NARRATION,
  social: SKILL_SOCIAL,
  rules: SKILL_RULES,
  campaign: SKILL_CAMPAIGN,
  // DM prep skills (will be converted to fork-skills in Phase C)
  recap: SKILL_RECAP,
  "npc-voice": SKILL_NPC_VOICE,
  "story-arc": SKILL_STORY_ARC,
  "loot-drop": SKILL_LOOT_DROP,
  tavern: SKILL_TAVERN,
  travel: SKILL_TRAVEL,
  trap: SKILL_TRAP,
  puzzle: SKILL_PUZZLE,
};

/**
 * Set-in-stone DM rules — written to .claude/rules/<name>.md, loaded into every session.
 *
 * `invariants.md` is the consolidated card and the contract; it wins on conflict.
 * Other rules are deep-dive references for edge cases / examples — kept for
 * targeted lookup, not for redundant restatement of the card.
 *
 * `player-identity`, `creativity`, and `entity-highlighting` were collapsed
 * into the card during the conductor-quick-reference refactor; their content
 * lives on the card and in skill files (narration / npc-voice / scene-builder).
 */
const NATIVE_RULES: Record<string, string> = {
  invariants: RULE_INVARIANTS,
  "response-vs-acknowledge": RULE_RESPONSE_VS_ACKNOWLEDGE,
  "action-ref": RULE_ACTION_REF,
  "skills-routing": RULE_SKILLS_ROUTING,
  "lookup-before-narrate": RULE_LOOKUP_BEFORE_NARRATE,
};

/** DM-runtime subagents — written to .claude/agents/<name>.md. Referenced by fork-skills for specialist dispatch. */
const NATIVE_AGENTS: Record<string, string> = {
  "combat-resolver": AGENT_COMBAT_RESOLVER,
  "rules-advisor": AGENT_RULES_ADVISOR,
  "encounter-designer": AGENT_ENCOUNTER_DESIGNER,
  "npc-voice": AGENT_NPC_VOICE,
  "scene-builder": AGENT_SCENE_BUILDER,
  lorekeeper: AGENT_LOREKEEPER,
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
  // Default: opus — the conductor coordinates a specialist team across long sessions,
  // so 1M context (Opus 4.7 / 4.6) pays off. Specialists run on Sonnet via their own
  // .claude/agents/*.md frontmatter.
  let roomCode = findArg("--room");
  let model = findArg("--model") || "opus";
  const workerUrl = findArg("--worker-url") || process.env.UNSEEN_WORKER_URL || DEFAULT_WORKER_URL;
  const campaignName = findArg("--campaign");

  if (!roomCode) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    roomCode = (await prompt(rl, "Room code: ")).trim().toUpperCase();
    if (!roomCode) {
      console.error("Error: Room code is required.");
      process.exit(1);
    }
    const modelInput = (await prompt(rl, `Model [${model}] (opus/sonnet/haiku): `)).trim();
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

  // Write set-in-stone DM rules
  const rulesDir = path.join(workDir, ".claude", "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  for (const [name, content] of Object.entries(NATIVE_RULES)) {
    fs.writeFileSync(path.join(rulesDir, `${name}.md`), content);
  }

  // Write DM-runtime subagent definitions (specialists the conductor dispatches to via fork-skills)
  const agentsDir = path.join(workDir, ".claude", "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const [name, content] of Object.entries(NATIVE_AGENTS)) {
    fs.writeFileSync(path.join(agentsDir, `${name}.md`), content);
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

  // Write CLAUDE.md (trimmed core contract)
  fs.writeFileSync(path.join(workDir, "CLAUDE.md"), CLAUDE_MD);

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
