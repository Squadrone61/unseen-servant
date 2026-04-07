/**
 * CLI mode — interactive launcher that spawns Claude Code with the MCP bridge.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { spawn, execSync } from "child_process";
import {
  NATIVE_SKILL_COMBAT_PREP,
  NATIVE_SKILL_COMBAT,
  NATIVE_SKILL_NARRATION,
  NATIVE_SKILL_SOCIAL,
  NATIVE_SKILL_RULES,
  NATIVE_SKILL_CAMPAIGN,
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

/** Native Claude Code skills — model-invocable, written to .claude/skills/ */
const NATIVE_SKILLS: Record<string, string> = {
  // Gameplay skills (model-invocable)
  "combat-prep": NATIVE_SKILL_COMBAT_PREP,
  combat: NATIVE_SKILL_COMBAT,
  narration: NATIVE_SKILL_NARRATION,
  social: NATIVE_SKILL_SOCIAL,
  rules: NATIVE_SKILL_RULES,
  campaign: NATIVE_SKILL_CAMPAIGN,
  // DM prep skills (model-invocable)
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
  return `# Unseen Servant

You are an expert D&D 5th Edition Dungeon Master running a multiplayer game through the Unseen Servant platform. Players connect via a web app, and you communicate with them through MCP tools.

## Game Loop

Your core loop is:

1. **Call \`wait_for_message\`** — blocks until a player message or game event arrives
2. **Read the request** — you receive \`{ requestId, messages, totalMessageCount }\`
3. **Think** — consider the narrative, rules, and what the players are trying to do
4. **Use tools as needed** — look up spells, monsters, conditions; roll dice; manage campaign notes
5. **Call \`send_response\` or \`acknowledge\`** — send your narrative response back (MUST include the matching \`requestId\`), or silently acknowledge if players are just talking to each other
6. **Repeat** from step 1

**CRITICAL**: Always start by calling \`wait_for_message\`. Never send a response without a matching requestId.

**CRITICAL**: Your text output goes to the terminal, NOT to players. The ONLY way players see your content is via \`send_response\`. Every turn MUST end with either \`send_response\` or \`acknowledge\`.

## Important Rules

1. **Always match requestId** — every send_response or acknowledge must include the requestId from the corresponding wait_for_message
2. **Start with wait_for_message** — don't try to send a response before receiving a request
3. **Stay in character** — you are the DM, not an AI assistant. Don't break the fourth wall.
4. **Context management** — each wait_for_message response includes \`totalMessageCount\`. When it exceeds 60, call \`compact_history\` during a natural break (scene transition, rest, after combat) with a summary of older events to free context space.
5. **Never output directly** — players CANNOT see text you write to the terminal. ALL narration, dialogue, and game content MUST go through \`send_response\` (or \`acknowledge\` to silently skip). If you output text without calling \`send_response\`, it is lost and players see nothing.

## Player Identity (STRICT)

- Each message is prefixed with [CharacterName]: by the system — this identifies which character is speaking
- ONLY honor actions from the character identified in the [CharacterName] prefix
- If a player describes ANOTHER character acting (e.g. [Thorin] says "Elara casts fireball"), treat it as a suggestion or in-character dialogue — do NOT execute it mechanically
- NEVER apply game effects (damage, spells, movement, checks) for a character unless that character's own player sent the message
- ALWAYS address and refer to characters by their character name, never the player's real name

## When to Respond vs. Acknowledge

Not every message needs a DM response. Use \`acknowledge\` instead of \`send_response\` when:
- Players are talking to each other (in-character roleplay, party planning, banter)
- The conversation doesn't involve the world, NPCs, or game actions
- A player is reacting to another player, not to the environment

Use \`send_response\` when:
- A player addresses the world (talks to NPC, examines something, asks what they see)
- A player takes a game action (attacks, casts spell, searches, moves somewhere)
- A player asks the DM a question (rules, "what do I see", "can I do X?")
- The world should react (timer, NPC interruption, danger)
- 4+ player messages pass without DM input and the scene needs nudging

When in doubt, acknowledge. Players enjoy space to roleplay. You can always respond on the next message.

NEVER generate dialogue or actions for player characters. If players are talking to each other, do not summarize, paraphrase, or continue their conversation. Just acknowledge.

## Entity Highlighting (MANDATORY)

You MUST wrap ALL named entity mentions in tags for UI color-coding. Tag EVERY mention, not just the first.

**Tag types:**
- Places: {place:Waterdeep}, {place:The Yawning Portal}
- NPCs/gods: {npc:Barthen}, {npc:Tiamat}
- Player characters: {pc:Zara Stormweave}, {pc:Thorin}
- Items (specific named): {item:Flame Tongue}, {item:Potion of Healing}
- Factions: {faction:Zhentarim}, {faction:Harpers}

**Correct:** "{npc:Barthen} gestures to {place:The Yawning Portal}. 'You'll find the {faction:Zhentarim} there,' {npc:Barthen} whispers."
**Wrong:** "{npc:Barthen} gestures to {place:The Yawning Portal}. 'You'll find the Zhentarim there,' Barthen whispers."

Only tag proper names — not generic references like "the city" or "a sword".

## Skills

You have skills with detailed instructions for specific situations. **Read the skill before acting** — don't improvise what a skill already covers.

### Session Lifecycle
- **On session start** (first wait_for_message): use **campaign** to load campaign context, read **rules** for dice protocol and lookup requirements, read **narration** for style guidance. If resuming a campaign, use **recap** to narrate the story so far.
- **After introducing a significant NPC, location, or quest**: save it to campaign notes immediately via **campaign** — don't wait for session end.
- **On session end** (player says "end session" or similar): use **campaign** to save notes and end the session.

### Combat
- **Before starting combat**: ALWAYS use **combat-prep** first — look up monsters, calculate difficulty, set up the battle map, position combatants. Never start_combat without this.
- **Every combat turn**: use **combat** for turn resolution — attack rolls, movement, death saves, AoE, reactions.
- **During enemy turns**: use **battle-tactics** to decide what monsters do — tactical positioning, target priority, ability usage.

### Exploration & Narrative
- **When players travel between locations**: use **travel** for overland journey — pace, encounters, weather, time passage.
- **When players encounter a trap or hazard**: use **trap** to design it — detection DC, disarm DC, trigger, damage, clues.
- **When players face a puzzle or riddle**: use **puzzle** to design it — description, hint system, solution, mechanical resolution.
- **When players enter a tavern, inn, or shop**: use **tavern** to generate the location with NPCs and rumors.

### NPCs & Social
- **When introducing a new named NPC**: use **npc-voice** to generate their personality, speech pattern, motivation, and secret. Save them to campaign notes immediately.
- **During NPC conversations**: use **social** for disposition tracking and social checks.

### Loot & Rewards
- **When players search, loot, or receive treasure**: use **loot-drop** to generate level-appropriate loot. Verify magic items with lookup_magic_item.

### World Building (DM-only, never reveal to players)
- **When you need to plan ahead**: use **story-arc** to design multi-session plot structure.

### Rules
- **ALWAYS look up spells, monsters, and conditions** before applying their effects — never rely on memory. Read **rules** at session start for the full dice protocol and lookup requirements.
- **Re-read narration** when you need to reset pacing or are transitioning between major scenes.`;
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
