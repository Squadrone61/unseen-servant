import * as fs from "fs";
import * as path from "path";
import type { Scenario, ScenarioAssertions, ScenarioFrontmatter } from "./types.js";

/**
 * Tiny YAML parser — only handles what scenario files need:
 *   key: scalar          (string | number | boolean)
 *   key: [a, b, c]       (inline list)
 *   key: "quoted scalar"
 * No nesting, no anchors. Throws on unsupported syntax so we fail loudly.
 */
function parseSimpleYaml(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = source.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) throw new Error(`parseSimpleYaml: cannot parse line: ${raw}`);
    const [, key, valueRaw] = m;
    const v = valueRaw.trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      const inner = v.slice(1, -1).trim();
      result[key] = inner ? inner.split(",").map((s) => unquote(s.trim())) : [];
    } else if (v === "true" || v === "false") {
      result[key] = v === "true";
    } else if (v && !isNaN(Number(v))) {
      result[key] = Number(v);
    } else if (v === "" || v === "null") {
      result[key] = null;
    } else {
      result[key] = unquote(v);
    }
  }
  return result;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

const FRONTMATTER_RX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const ASSERTIONS_RX = /##\s*Assertions[\s\S]*?```ya?ml\r?\n([\s\S]*?)```/i;

export function parseScenarioFile(filePath: string): Scenario {
  const raw = fs.readFileSync(filePath, "utf-8");
  const fm = FRONTMATTER_RX.exec(raw);
  if (!fm) throw new Error(`parseScenarioFile: ${filePath} has no YAML frontmatter`);
  const [, frontmatterSrc, body] = fm;
  const frontmatter = parseSimpleYaml(frontmatterSrc) as unknown as ScenarioFrontmatter;
  if (!frontmatter.fixture) {
    throw new Error(`parseScenarioFile: ${filePath} missing required 'fixture' field`);
  }

  const am = ASSERTIONS_RX.exec(body);
  if (!am) {
    throw new Error(
      `parseScenarioFile: ${filePath} missing '## Assertions' section with a yaml fenced block`,
    );
  }
  const assertions = parseSimpleYaml(am[1]) as unknown as ScenarioAssertions;

  // Description = body up to the assertions header.
  const description = body.split(/##\s*Assertions/i)[0].trim();

  return {
    name: path.basename(filePath, path.extname(filePath)).replace(/\.scenario$/, ""),
    filePath,
    frontmatter,
    description,
    assertions,
  };
}
