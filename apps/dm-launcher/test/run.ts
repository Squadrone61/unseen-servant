/**
 * Scenario test runner CLI.
 *   pnpm dm:test                      # run all .scenario.md files
 *   pnpm dm:test pattern               # run scenarios whose name matches `pattern`
 *
 * Output: human-readable pass/fail summary to stdout.
 * Detailed transcripts written to .testing/dm-scenarios/<name>/.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { runScenario } from "./harness/scenario-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCENARIOS_DIR = path.join(__dirname, "scenarios");
const TRANSCRIPTS_DIR = path.join(REPO_ROOT, ".testing", "dm-scenarios");

const pattern = process.argv[2];

function listScenarioFiles(): string[] {
  if (!fs.existsSync(SCENARIOS_DIR)) return [];
  return fs
    .readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith(".scenario.md"))
    .filter((f) => !pattern || f.includes(pattern))
    .sort()
    .map((f) => path.join(SCENARIOS_DIR, f));
}

function writeTranscript(scenarioName: string, body: string): void {
  const dir = path.join(TRANSCRIPTS_DIR, scenarioName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "transcript.md"), body);
}

function formatTranscript(name: string, result: Awaited<ReturnType<typeof runScenario>>): string {
  const lines: string[] = [];
  lines.push(`# Transcript: ${name}`);
  lines.push("");
  lines.push(`**Result:** ${result.passed ? "✅ PASS" : "❌ FAIL"} (${result.durationMs}ms)`);
  if (result.failures.length) {
    lines.push("");
    lines.push("## Failures");
    for (const f of result.failures) lines.push(`- ${f}`);
  }
  lines.push("");
  lines.push("## Tool Calls");
  for (const t of result.toolCalls) {
    lines.push(`- **${t.tool}** (${t.durationMs}ms)${t.error ? ` — ERROR: ${t.error}` : ""}`);
    lines.push(`  args: \`${JSON.stringify(t.args)?.slice(0, 200) ?? ""}\``);
  }
  lines.push("");
  lines.push("## DM Broadcasts");
  for (const b of result.broadcasts.filter((b) => b.type === "server:ai")) {
    const p = b.payload as { content?: string };
    lines.push(`> ${(p.content ?? "").replace(/\n/g, "\n> ")}`);
  }
  if (result.bridgeStderr) {
    lines.push("");
    lines.push("## Bridge stderr");
    lines.push("```");
    lines.push(result.bridgeStderr.slice(0, 4000));
    lines.push("```");
  }
  if (result.conductorStdout) {
    lines.push("");
    lines.push("## Conductor stdout (claude -p)");
    lines.push("```");
    lines.push(result.conductorStdout.slice(0, 4000));
    lines.push("```");
  }
  return lines.join("\n");
}

const files = listScenarioFiles();
if (files.length === 0) {
  console.log(pattern ? `No scenarios match '${pattern}'.` : "No .scenario.md files found.");
  process.exit(0);
}

console.log(`Running ${files.length} scenario(s)...`);

let passed = 0;
let failed = 0;

for (const file of files) {
  const name = path.basename(file).replace(/\.scenario\.md$/, "");
  process.stdout.write(`\n→ ${name}\n`);
  try {
    const result = await runScenario(file);
    writeTranscript(name, formatTranscript(name, result));
    if (result.passed) {
      console.log(`  ✅ PASS (${result.durationMs}ms)`);
      passed++;
    } else {
      console.log(`  ❌ FAIL (${result.durationMs}ms)`);
      for (const f of result.failures) console.log(`     - ${f}`);
      failed++;
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
