/**
 * Local SRD lookup service — reads markdown files from disk.
 * Supports both SRD 5.2 (2024) and SRD 5.1 (2014) directory layouts via SrdLayout config.
 * No external API calls, no JSON index — just filename-based lookup + content search.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

interface SearchResult {
  name: string;
  source: string;
  content: string;
}

interface SrdLayout {
  /** Spell subdirectories. 5.2: ["Cantrip","Level 1",...]. 5.1: ["Cantrip","1st Level",...]. Empty = flat. */
  spellSubDirs: string[];
  /** Directory name for conditions. 5.2: "Glossary". 5.1: "Conditions". */
  conditionDir: string;
  /** Whether conditions use [Condition] tags (5.2) or are all conditions by default (5.1). */
  conditionUseTags: boolean;
  /** Magic item rarity subdirectories. */
  magicItemSubDirs: string[];
  /** Additional directories to warm for searchRules. */
  extraDirs: string[];
}

const LAYOUT_52: SrdLayout = {
  spellSubDirs: ["Cantrip", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Level 7", "Level 8", "Level 9"],
  conditionDir: "Glossary",
  conditionUseTags: true,
  magicItemSubDirs: ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies"],
  extraDirs: ["Classes", "Equipment", "Backgrounds", "Species", "Playing", "Gameplay", "Services"],
};

export const LAYOUT_51: SrdLayout = {
  spellSubDirs: ["Cantrip", "1st Level", "2nd Level", "3rd Level", "4th Level", "5th Level", "6th Level", "7th Level", "8th Level", "9th Level"],
  conditionDir: "Conditions",
  conditionUseTags: false,
  magicItemSubDirs: ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies"],
  extraDirs: ["Combat", "Abilities", "Environment", "NPCs", "Spellcasting", "Resting", "Races", "Character", "Movement", "Between Adventures"],
};

export class SrdLookup {
  /** Cached directory listings: dir path → array of { name (without .md), fullPath } */
  private dirCache = new Map<string, Array<{ name: string; fullPath: string }>>();

  /** Cached file contents */
  private contentCache = new Map<string, string>();

  private layout: SrdLayout;

  constructor(private dataDir: string, layout?: SrdLayout) {
    this.layout = layout ?? LAYOUT_52;
    this.warmCaches();
  }

  // ── Direct Lookups ───────────────────────────────────────────────

  lookupSpell(name: string): string | null {
    const spellsDir = join(this.dataDir, "Spells");
    if (this.layout.spellSubDirs.length === 0) {
      // Flat layout — scan Spells/ directly
      return this.findInDir(spellsDir, name);
    }
    for (const sub of this.layout.spellSubDirs) {
      const result = this.findInDir(join(spellsDir, sub), name);
      if (result) return result;
    }
    return null;
  }

  lookupMonster(name: string): string | null {
    return this.findInDir(join(this.dataDir, "Monsters"), name);
  }

  lookupCondition(name: string): string | null {
    const condDir = join(this.dataDir, this.layout.conditionDir);

    if (!this.layout.conditionUseTags) {
      // 5.1: all files in Conditions/ are conditions — direct lookup
      return this.findInDir(condDir, name);
    }

    // 5.2: Conditions are in Glossary/ and tagged with [Condition]
    const result = this.findInDir(condDir, name);
    if (result && (result.includes("[Condition]") || result.includes("\\[Condition\\]"))) return result;
    // Try with common condition names that may not have exact filename match
    return this.findInDirByContent(condDir, name, "Condition");
  }

  lookupGlossary(name: string): string | null {
    return this.findInDir(join(this.dataDir, "Glossary"), name);
  }

  lookupMagicItem(name: string): string | null {
    const magicDir = join(this.dataDir, "Magic Items");
    // Try top-level first
    const top = this.findInDir(magicDir, name);
    if (top) return top;
    // Scan rarity subdirs from layout config
    for (const rarity of this.layout.magicItemSubDirs) {
      const result = this.findInDir(join(magicDir, rarity), name);
      if (result) return result;
    }
    return null;
  }

  lookupFeat(name: string): string | null {
    return this.findInDir(join(this.dataDir, "Feats"), name);
  }

  // ── General Search ───────────────────────────────────────────────

  searchRules(query: string, limit = 3): SearchResult[] {
    const keywords = this.tokenize(query);
    if (keywords.length === 0) return [];

    const scored: Array<SearchResult & { score: number }> = [];

    for (const [dir, entries] of this.dirCache) {
      const source = this.dirToSource(dir);
      for (const entry of entries) {
        let score = 0;

        // Score filename matches (weighted higher)
        const nameLower = entry.name.toLowerCase();
        for (const kw of keywords) {
          if (nameLower === kw) score += 10;
          else if (nameLower.includes(kw)) score += 5;
        }

        // If filename matched, also check content for extra scoring
        if (score > 0) {
          const content = this.readFile(entry.fullPath);
          if (content) {
            const contentLower = content.toLowerCase();
            for (const kw of keywords) {
              if (contentLower.includes(kw)) score += 1;
            }
            scored.push({ name: entry.name, source, content, score });
          }
          continue;
        }

        // If no filename match, check content (slower path)
        const content = this.readFile(entry.fullPath);
        if (!content) continue;
        const contentLower = content.toLowerCase();
        for (const kw of keywords) {
          if (contentLower.includes(kw)) score += 2;
        }
        if (score > 0) {
          scored.push({ name: entry.name, source, content, score });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ name, source, content }) => ({ name, source, content }));
  }

  // ── Internal Helpers ─────────────────────────────────────────────

  private warmCaches(): void {
    const topDirs: string[] = [];

    // Spell subdirs
    if (this.layout.spellSubDirs.length === 0) {
      topDirs.push("Spells");
    } else {
      for (const sub of this.layout.spellSubDirs) {
        topDirs.push(`Spells/${sub}`);
      }
    }

    // Core dirs
    topDirs.push("Monsters", this.layout.conditionDir, "Feats");

    // Magic item dirs
    topDirs.push("Magic Items");
    for (const rarity of this.layout.magicItemSubDirs) {
      topDirs.push(`Magic Items/${rarity}`);
    }

    // Extra dirs from layout
    for (const extra of this.layout.extraDirs) {
      topDirs.push(extra);
    }

    for (const rel of topDirs) {
      const dir = join(this.dataDir, rel);
      this.listDir(dir);
    }

    console.error(`[srd-lookup] Warmed caches for ${this.dirCache.size} directories (${this.dataDir.includes("5.1") ? "5.1" : "5.2"})`);
  }

  private listDir(dir: string): Array<{ name: string; fullPath: string }> {
    const cached = this.dirCache.get(dir);
    if (cached) return cached;

    if (!existsSync(dir)) {
      this.dirCache.set(dir, []);
      return [];
    }

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith(".md"))
        .map(e => ({
          name: basename(e.name, ".md"),
          fullPath: join(dir, e.name),
        }));
      this.dirCache.set(dir, entries);

      // Also recurse into subdirectories (for Classes/Barbarian/, etc.)
      const subDirs = readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory());
      for (const sub of subDirs) {
        this.listDir(join(dir, sub.name));
      }

      return entries;
    } catch {
      this.dirCache.set(dir, []);
      return [];
    }
  }

  private readFile(fullPath: string): string | null {
    const cached = this.contentCache.get(fullPath);
    if (cached !== undefined) return cached;

    try {
      const content = readFileSync(fullPath, "utf-8");
      this.contentCache.set(fullPath, content);
      return content;
    } catch {
      return null;
    }
  }

  private findInDir(dir: string, name: string): string | null {
    const entries = this.listDir(dir);
    const normalized = this.normalize(name);
    const queryWords = normalized.split(" ").filter(w => w.length > 0);

    // 1. Exact match
    for (const entry of entries) {
      if (this.normalize(entry.name) === normalized) {
        return this.readFile(entry.fullPath);
      }
    }

    // 2. Entry name contains query (e.g. "Goblin Warrior" contains "goblin")
    //    Score by how close the lengths are (prefer tighter matches)
    let bestMatch: { entry: typeof entries[0]; score: number } | null = null;
    for (const entry of entries) {
      const entryNorm = this.normalize(entry.name);
      if (entryNorm.includes(normalized)) {
        // Tighter match = higher score (exact length match = 1.0)
        const score = normalized.length / entryNorm.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { entry, score };
        }
      }
    }
    if (bestMatch) return this.readFile(bestMatch.entry.fullPath);

    // 3. Fuzzy word-overlap match
    //    (e.g. "Potions of Healing" matches "Potion of Healing", "Tasha's Hideous Laughter" matches "Hideous Laughter")
    //    Filter stop words, require significant content-word overlap
    const STOP_WORDS = new Set(["of", "the", "a", "an", "and", "or", "in", "on", "to", "for", "with", "by"]);
    const queryContent = queryWords.filter(w => !STOP_WORDS.has(w));
    if (queryContent.length === 0) return null;

    let bestWordMatch: { entry: typeof entries[0]; score: number } | null = null;
    for (const entry of entries) {
      const entryWords = this.normalize(entry.name).split(" ").filter(w => w.length > 0);
      const entryContent = entryWords.filter(w => !STOP_WORDS.has(w));
      if (entryContent.length === 0) continue;

      // Count content words that match (allow singular/plural via startsWith)
      const matchingEntry = entryContent.filter(ew =>
        queryContent.some(qw => ew === qw || ew.startsWith(qw) || qw.startsWith(ew))
      );
      const matchingQuery = queryContent.filter(qw =>
        entryContent.some(ew => ew === qw || ew.startsWith(qw) || qw.startsWith(ew))
      );

      // Both the entry and query must have most of their content words matched
      const entryOverlap = matchingEntry.length / entryContent.length;
      const queryOverlap = matchingQuery.length / queryContent.length;

      // Require: all entry content words match, AND at least 50% of query content words match
      if (entryOverlap >= 1.0 && queryOverlap >= 0.5) {
        const score = entryOverlap + queryOverlap; // max 2.0
        if (!bestWordMatch || score > bestWordMatch.score) {
          bestWordMatch = { entry, score };
        }
      }
    }
    if (bestWordMatch) return this.readFile(bestWordMatch.entry.fullPath);

    return null;
  }

  private findInDirByContent(dir: string, name: string, requiredTag: string): string | null {
    const entries = this.listDir(dir);
    const normalized = this.normalize(name);

    for (const entry of entries) {
      if (this.normalize(entry.name).includes(normalized) || normalized.includes(this.normalize(entry.name))) {
        const content = this.readFile(entry.fullPath);
        if (content && content.includes(requiredTag)) return content;
      }
    }
    return null;
  }

  private normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/['']/g, "")
      .replace(/[-_/\\]/g, " ")
      .replace(/\s+/g, " ");
  }

  private tokenize(query: string): string[] {
    return this.normalize(query)
      .split(" ")
      .filter(w => w.length > 1);
  }

  private dirToSource(dir: string): string {
    const rel = dir.replace(this.dataDir, "").replace(/^[/\\]/, "");
    return rel || "root";
  }
}
