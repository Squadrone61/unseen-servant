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
  // Pre-pass: join continuation lines so prettier's "key:\n  [items]" wrap
  // collapses back to "key: [items]". Continuation = indented (starts with space)
  // and the previous logical line ends with ':' or with an open '[' that isn't yet closed.
  const collapsedLines: string[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const stripped = raw.replace(/#.*$/, "").trimEnd();
    if (!stripped) continue;
    const isIndentedContinuation = /^\s/.test(raw) && collapsedLines.length > 0;
    if (isIndentedContinuation) {
      collapsedLines[collapsedLines.length - 1] += " " + stripped.trim();
    } else {
      collapsedLines.push(stripped);
    }
  }

  const result: Record<string, unknown> = {};
  for (const line of collapsedLines) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) throw new Error(`parseSimpleYaml: cannot parse line: ${line}`);
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
