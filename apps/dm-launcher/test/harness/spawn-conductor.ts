import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { pathToFileURL, fileURLToPath } from "url";
import type { FixtureState, FixtureWorld, Scenario } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DM_LAUNCHER_SRC = path.join(REPO_ROOT, "apps", "dm-launcher", "src");
const TEST_FIXTURES = path.join(REPO_ROOT, "apps", "dm-launcher", "test", "fixtures");
const TEST_MCP_SERVER = path.join(__dirname, "test-mcp-server.ts");

export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  workDir: string;
  toolLogPath: string;
  broadcastLogPath: string;
}

/**
 * Build a temp workspace from the scenario's selected skills/rules/agents,
 * write the fixture + .mcp.json, then spawn `claude -p` in print mode.
 * Returns when claude exits (or after the configured timeout).
 */
export async function spawnConductor(scenario: Scenario): Promise<SpawnResult> {
  const fm = scenario.frontmatter;
  const timeoutMs = (fm.timeoutSec ?? 60) * 1000;

  // 1. Build a unique temp workdir for this scenario run.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `dm-test-${scenario.name}-`));
  const skillsDir = path.join(workDir, ".claude", "skills");
  const rulesDir = path.join(workDir, ".claude", "rules");
  const agentsDir = path.join(workDir, ".claude", "agents");
  const campaignsDir = path.join(workDir, "campaigns");
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(campaignsDir, { recursive: true });

  // 2. Copy selected skills / rules / agents from src.
  for (const skillName of fm.skills ?? []) {
    const src = path.join(DM_LAUNCHER_SRC, "skills", `${skillName}.md`);
    if (!fs.existsSync(src)) throw new Error(`spawn: skill not found: ${src}`);
    const dir = path.join(skillsDir, skillName);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, "SKILL.md"));
  }
  for (const ruleName of fm.rules ?? []) {
    const src = path.join(DM_LAUNCHER_SRC, "rules", `${ruleName}.md`);
    if (!fs.existsSync(src)) throw new Error(`spawn: rule not found: ${src}`);
    fs.copyFileSync(src, path.join(rulesDir, `${ruleName}.md`));
  }
  // invariants.md is the always-on contract — load it for every scenario,
  // matching the production loader (NATIVE_RULES in cli.ts). The scenario's
  // explicit `rules:` list still applies on top.
  const invariantsSrc = path.join(DM_LAUNCHER_SRC, "rules", "invariants.md");
  if (fs.existsSync(invariantsSrc)) {
    fs.copyFileSync(invariantsSrc, path.join(rulesDir, "invariants.md"));
  }
  for (const agentName of fm.agents ?? []) {
    const src = path.join(DM_LAUNCHER_SRC, "agents", `${agentName}.md`);
    if (!fs.existsSync(src)) throw new Error(`spawn: agent not found: ${src}`);
    fs.copyFileSync(src, path.join(agentsDir, `${agentName}.md`));
  }

  // 3. Optionally write CLAUDE.md (the conductor core contract).
  if (fm.loadClaudeMd !== false) {
    fs.copyFileSync(path.join(DM_LAUNCHER_SRC, "claude-md.md"), path.join(workDir, "CLAUDE.md"));
  }

  // 4. Build fixture world from the named .ts module, merge in the scenario's
  //    player message, and serialize to a temp JSON the bridge reads at boot.
  const fixtureModulePath = path.join(TEST_FIXTURES, `${fm.fixture}.ts`);
  if (!fs.existsSync(fixtureModulePath)) {
    throw new Error(`spawn: fixture not found: ${fixtureModulePath}`);
  }
  const fixtureModule = (await import(pathToFileURL(fixtureModulePath).href)) as {
    buildFixture?: () => FixtureWorld;
  };
  if (typeof fixtureModule.buildFixture !== "function") {
    throw new Error(
      `spawn: ${fixtureModulePath} must export a buildFixture(): FixtureWorld function`,
    );
  }
  const world = fixtureModule.buildFixture();
  if (!world.characters[fm.player_name]) {
    throw new Error(
      `spawn: scenario player_name '${fm.player_name}' not in fixture characters ` +
        `(have: ${Object.keys(world.characters).join(", ")})`,
    );
  }
  if (world.bundles && world.bundles.length > 0 && !world.campaignName) {
    throw new Error(
      `spawn: fixture '${fm.fixture}' provides bundles[] but no campaignName — ` +
        `bundles are written via the active campaign and need a campaignName to land`,
    );
  }
  const fixture: FixtureState = {
    ...world,
    playerMessage: { playerName: fm.player_name, chat: fm.player_message },
  };
  const fixturePath = path.join(workDir, "fixture.json");
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

  // 5. Allocate per-run log files for tool calls and broadcasts.
  const toolLogPath = path.join(workDir, "tool-calls.jsonl");
  const broadcastLogPath = path.join(workDir, "broadcasts.jsonl");
  fs.writeFileSync(toolLogPath, "");
  fs.writeFileSync(broadcastLogPath, "");

  // 6. Write .mcp.json. claude spawns the test bridge as a stdio child.
  const mcpConfig = {
    mcpServers: {
      "unseen-servant": {
        command: "npx",
        args: ["tsx", TEST_MCP_SERVER],
        env: {
          TEST_FIXTURE_PATH: fixturePath,
          TEST_LOG_PATH: toolLogPath,
          TEST_BROADCAST_PATH: broadcastLogPath,
          TEST_CAMPAIGNS_DIR: campaignsDir,
          UNSEEN_CAMPAIGNS_DIR: campaignsDir,
        },
      },
    },
  };
  fs.writeFileSync(path.join(workDir, ".mcp.json"), JSON.stringify(mcpConfig, null, 2));

  // 7. Spawn claude.
  const model = fm.model ?? "sonnet";
  const claudeArgs = [
    "-p",
    "Process the next player message. Call wait_for_message ONCE, then resolve and " +
      "close the turn with send_response or acknowledge. Do not loop.",
    "--mcp-config",
    path.join(workDir, ".mcp.json"),
    "--strict-mcp-config",
    "--no-session-persistence",
    "--model",
    model,
    "--allowedTools",
    "mcp__unseen-servant__*,Task",
    "--system-prompt",
    "You are the Unseen Servant. Follow all instructions in CLAUDE.md and .claude/rules. " +
      "After the first send_response or acknowledge, the harness will end the run.",
  ];

  const start = Date.now();
  const proc = spawn("claude", claudeArgs, {
    cwd: workDir,
    env: { ...process.env },
  });

  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (d) => {
    stdout += d.toString();
  });
  proc.stderr?.on("data", (d) => {
    stderr += d.toString();
  });

  const result: SpawnResult = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        workDir,
        toolLogPath,
        broadcastLogPath,
      });
    });
  });

  return result;
}
