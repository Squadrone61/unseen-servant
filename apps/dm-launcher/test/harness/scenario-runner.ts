import * as fs from "fs";
import { parseScenarioFile } from "./parse-scenario.js";
import { spawnConductor } from "./spawn-conductor.js";
import type { BroadcastLog, RunResult, Scenario, ToolCallLog } from "./types.js";

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function matchPattern(haystack: string, needle: string): boolean {
  // Support /regex/i syntax; fall back to case-insensitive substring.
  const re = /^\/(.+)\/([gimsuy]*)$/.exec(needle);
  if (re) return new RegExp(re[1], re[2] || "i").test(haystack);
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function dmTextFromBroadcasts(broadcasts: BroadcastLog[]): string {
  const aiMessages = broadcasts
    .filter((b) => b.type === "server:ai")
    .map((b) => {
      const p = b.payload as { content?: string };
      return p.content ?? "";
    });
  return aiMessages.join("\n");
}

export async function runScenario(filePath: string): Promise<RunResult> {
  const scenario: Scenario = parseScenarioFile(filePath);
  const start = Date.now();
  const spawn = await spawnConductor(scenario);

  const toolCalls = readJsonl<ToolCallLog>(spawn.toolLogPath);
  const broadcasts = readJsonl<BroadcastLog>(spawn.broadcastLogPath);
  const dmText = dmTextFromBroadcasts(broadcasts);
  const calledTools = new Set(toolCalls.map((t) => t.tool));
  const closedTurn = calledTools.has("send_response") || calledTools.has("acknowledge");

  const failures: string[] = [];
  const a = scenario.assertions;

  if (a.must_call) {
    for (const t of a.must_call) {
      if (!calledTools.has(t)) failures.push(`must_call: tool '${t}' was never invoked`);
    }
  }
  if (a.must_not_call) {
    for (const t of a.must_not_call) {
      if (calledTools.has(t))
        failures.push(`must_not_call: tool '${t}' was invoked but shouldn't have been`);
    }
  }
  if (a.must_say) {
    for (const pat of a.must_say) {
      if (!matchPattern(dmText, pat)) failures.push(`must_say: DM output never contained '${pat}'`);
    }
  }
  if (a.must_not_say) {
    for (const pat of a.must_not_say) {
      if (matchPattern(dmText, pat))
        failures.push(`must_not_say: DM output contained '${pat}' but shouldn't have`);
    }
  }
  if (a.must_close_turn !== false && !closedTurn) {
    failures.push("must_close_turn: turn never closed (no send_response or acknowledge)");
  }

  return {
    scenario: scenario.name,
    passed: failures.length === 0,
    failures,
    toolCalls,
    broadcasts,
    closedTurn,
    durationMs: Date.now() - start,
    bridgeStderr: spawn.stderr,
    conductorStdout: spawn.stdout,
  };
}
