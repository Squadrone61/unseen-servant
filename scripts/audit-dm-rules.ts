/**
 * DM rules + skills + agents audit.
 *
 * Greps for known invariant phrases across `apps/dm-launcher/src/{rules,skills,agents}/`
 * and flags:
 *   - **Drift**: an invariant phrase that appears in two files with materially
 *     different wording (e.g. "always set_concentration" vs "usually set_concentration").
 *   - **Orphans**: phrases referenced from one place that don't exist anywhere
 *     (e.g. a rule file points to "narration.md" but it doesn't exist).
 *
 * The audit is opinionated — if you add a new invariant, register it here so it
 * gets enforced. The script is deliberately small + readable; cleverness is the
 * enemy of trust here.
 *
 * Exit codes:
 *   0 — no issues
 *   1 — at least one drift or orphan flagged
 *
 * Usage:
 *   pnpm audit:dm-rules
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DM_SRC = path.join(REPO_ROOT, "apps", "dm-launcher", "src");

interface FileEntry {
  /** Path relative to `apps/dm-launcher/src/`. */
  rel: string;
  abs: string;
  text: string;
}

function listMd(dir: string, accumulator: FileEntry[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listMd(abs, accumulator);
    } else if (entry.name.endsWith(".md")) {
      const rel = path.relative(DM_SRC, abs).replace(/\\/g, "/");
      accumulator.push({ rel, abs, text: fs.readFileSync(abs, "utf-8") });
    }
  }
}

const files: FileEntry[] = [];
listMd(path.join(DM_SRC, "rules"), files);
listMd(path.join(DM_SRC, "skills"), files);
listMd(path.join(DM_SRC, "agents"), files);
listMd(DM_SRC, files); // CLAUDE-md.md

/**
 * Each invariant has:
 *   - `phrase`: a regex matching the *concept* — broad enough to find every reference
 *   - `mustAgree`: regex(es) any matching context must NOT contain (signals drift)
 *
 * The audit flags any file that mentions the phrase but ALSO contains text
 * matching `mustAgree.disagrees`. Tune disagrees regexes carefully — false
 * positives erode trust in the audit.
 */
interface Invariant {
  id: string;
  phrase: RegExp;
  /** Phrases the agreement context MUST NOT contain. Each is "if any line near the phrase matches this, flag". */
  disagrees?: RegExp[];
  /** Authoritative source: every other file that mentions this phrase should not contradict the source. */
  authoritativeFile?: string;
}

const INVARIANTS: Invariant[] = [
  {
    id: "set_concentration",
    phrase: /set_concentration/,
    authoritativeFile: "rules/invariants.md",
    // Drift example: a file that says concentration is "optional" or "usually" tracked
    disagrees: [/concentration\s+is\s+optional/i, /usually\s+set_concentration/i],
  },
  {
    id: "advance_turn",
    phrase: /advance_turn/,
    authoritativeFile: "rules/invariants.md",
    // Drift example: a file telling the conductor to advance_turn for a player.
    disagrees: [/advance_turn[^.]*for\s+(?:a\s+)?player/i],
  },
  {
    id: "lookup-before-narrate",
    phrase: /never\s+narrate\s+(?:a\s+)?mechanic/i,
    authoritativeFile: "rules/invariants.md",
    // Drift: any file softening "never" → "usually" / "try to"
    disagrees: [/usually\s+narrate\s+mechanic/i, /try\s+to\s+lookup/i],
  },
  {
    id: "verify-spell-on-sheet",
    phrase: /(?:verify|check|confirm)[^.]*(?:spell|feature)[^.]*sheet/i,
    authoritativeFile: "rules/invariants.md",
    disagrees: [/list\s+alternatives\s+from\s+memory/i],
  },
  {
    id: "entity-tags",
    phrase: /\{(?:pc|npc|place|item|faction):/,
    authoritativeFile: "rules/invariants.md",
    // No drift regex — every reference is a usage example, which is fine.
  },
  {
    id: "action_ref",
    phrase: /action_ref/,
    authoritativeFile: "rules/invariants.md",
    disagrees: [/action_ref\s+is\s+optional\s+for\s+typed\s+damage/i],
  },
];

/** A single drift / orphan finding. */
interface Finding {
  kind: "drift" | "orphan";
  invariant: string;
  file: string;
  detail: string;
}

const findings: Finding[] = [];

// ─── Drift detection ───
// Negation tokens that flip a "bad" phrase into the rule itself ("NEVER list
// alternatives from memory"). We skip line matches whose immediate prefix
// contains any of these.
const NEGATION =
  /\b(?:never|not|n't|don't|do not|do NOT|avoid|prohibit|forbid|skip|halt|stop|warning|MUST NOT)\b/i;

for (const inv of INVARIANTS) {
  for (const f of files) {
    if (!inv.phrase.test(f.text)) continue;
    if (!inv.disagrees) continue;
    const lines = f.text.split(/\r?\n/);
    for (const bad of inv.disagrees) {
      for (const line of lines) {
        const m = bad.exec(line);
        if (!m) continue;
        // If the negation appears in the same line, it's the rule's own
        // prohibition — not drift.
        if (NEGATION.test(line)) continue;
        findings.push({
          kind: "drift",
          invariant: inv.id,
          file: f.rel,
          detail: `'${m[0]}' (line: "${line.trim().slice(0, 100)}") contradicts ${inv.authoritativeFile ?? "(no source set)"}`,
        });
      }
    }
  }
}

// ─── Orphan detection: files referenced as `.claude/rules/<name>.md` or
// `.claude/skills/<name>` that don't exist on disk.
const REF_RX = /\.claude\/(rules|skills|agents)\/([a-z0-9-]+)(?:\.md|\/SKILL\.md)?/gi;
const existingByKind: Record<string, Set<string>> = {
  rules: new Set(),
  skills: new Set(),
  agents: new Set(),
};
for (const f of files) {
  const parts = f.rel.split("/");
  if (parts[0] === "rules" && f.rel.endsWith(".md")) {
    existingByKind.rules.add(path.basename(f.rel, ".md"));
  } else if (parts[0] === "skills" && f.rel.endsWith(".md")) {
    existingByKind.skills.add(path.basename(f.rel, ".md"));
  } else if (parts[0] === "agents" && f.rel.endsWith(".md")) {
    existingByKind.agents.add(path.basename(f.rel, ".md"));
  }
}

for (const f of files) {
  for (const m of f.text.matchAll(REF_RX)) {
    const [, kind, name] = m;
    if (!existingByKind[kind]?.has(name)) {
      findings.push({
        kind: "orphan",
        invariant: `${kind}/${name}`,
        file: f.rel,
        detail: `references .claude/${kind}/${name} but no source file matches`,
      });
    }
  }
}

// ─── Report ───
if (findings.length === 0) {
  console.log(`✅ audit:dm-rules — ${files.length} files scanned, no drift or orphans found.`);
  process.exit(0);
}

const drifts = findings.filter((f) => f.kind === "drift");
const orphans = findings.filter((f) => f.kind === "orphan");

console.log(`❌ audit:dm-rules — ${findings.length} issue(s):\n`);
if (drifts.length) {
  console.log(`  Drift (${drifts.length}):`);
  for (const f of drifts) {
    console.log(`    [${f.invariant}] ${f.file}`);
    console.log(`      ${f.detail}`);
  }
}
if (orphans.length) {
  console.log(`  Orphan refs (${orphans.length}):`);
  for (const f of orphans) {
    console.log(`    [${f.invariant}] ${f.file}`);
    console.log(`      ${f.detail}`);
  }
}
process.exit(1);
