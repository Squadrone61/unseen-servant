/**
 * Local SRD 5.2 lookup service — reads markdown files from disk.
 * No external API calls, no JSON index — just filename-based lookup + content search.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

interface SearchResult {
  name: string;
  source: string;
  content: string;
}

export class SrdLookup {
  /** Cached directory listings: dir path → array of { name (without .md), fullPath } */
  private dirCache = new Map<string, Array<{ name: string; fullPath: string }>>();

  /** Cached file contents */
  private contentCache = new Map<string, string>();

  constructor(private dataDir: string) {
    this.warmCaches();
  }

  // ── Direct Lookups ───────────────────────────────────────────────

  lookupSpell(name: string): string | null {
    // Spells are organized in subdirectories: Cantrip, Level 1, Level 2, etc.
    const spellsDir = join(this.dataDir, "Spells");
    const subDirs = ["Cantrip", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Level 7", "Level 8", "Level 9"];
    for (const sub of subDirs) {
      const result = this.findInDir(join(spellsDir, sub), name);
      if (result) return result;
    }
    return null;
  }

  lookupMonster(name: string): string | null {
    return this.findInDir(join(this.dataDir, "Monsters"), name);
  }

  lookupCondition(name: string): string | null {
    // Conditions are in Glossary/ and tagged with [Condition] (markdown-escaped as \[Condition\])
    const result = this.findInDir(join(this.dataDir, "Glossary"), name);
    if (result && (result.includes("[Condition]") || result.includes("\\[Condition\\]"))) return result;
    // Try with common condition names that may not have exact filename match
    return this.findInDirByContent(join(this.dataDir, "Glossary"), name, "Condition");
  }

  lookupGlossary(name: string): string | null {
    return this.findInDir(join(this.dataDir, "Glossary"), name);
  }

  lookupMagicItem(name: string): string | null {
    // Magic items are organized in rarity subdirectories
    const magicDir = join(this.dataDir, "Magic Items");
    // Try top-level first
    const top = this.findInDir(magicDir, name);
    if (top) return top;
    // Scan rarity subdirs
    const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies"];
    for (const rarity of rarities) {
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
    const topDirs = [
      "Spells/Cantrip", "Spells/Level 1", "Spells/Level 2", "Spells/Level 3",
      "Spells/Level 4", "Spells/Level 5", "Spells/Level 6", "Spells/Level 7",
      "Spells/Level 8", "Spells/Level 9",
      "Monsters", "Glossary", "Feats",
      "Magic Items", "Magic Items/Common", "Magic Items/Uncommon", "Magic Items/Rare",
      "Magic Items/Very Rare", "Magic Items/Legendary", "Magic Items/Artifact", "Magic Items/Varies",
      "Classes", "Equipment", "Backgrounds", "Species",
      "Playing", "Gameplay", "Services",
    ];

    for (const rel of topDirs) {
      const dir = join(this.dataDir, rel);
      this.listDir(dir);
    }

    console.error(`[srd-lookup] Warmed caches for ${this.dirCache.size} directories`);
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

    // 1. Exact match
    for (const entry of entries) {
      if (this.normalize(entry.name) === normalized) {
        return this.readFile(entry.fullPath);
      }
    }

    // 2. Substring match (e.g. "red dragon" matches "Adult Red Dragon")
    for (const entry of entries) {
      if (this.normalize(entry.name).includes(normalized) || normalized.includes(this.normalize(entry.name))) {
        return this.readFile(entry.fullPath);
      }
    }

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
