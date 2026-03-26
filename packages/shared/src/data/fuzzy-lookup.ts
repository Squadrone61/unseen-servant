// Fuzzy lookup for D&D database entities
// Progressive matching: exact → substring → word → Levenshtein

export interface FuzzyResult<T> {
  match: T | null;
  suggestions: T[];
  matchType: "exact" | "substring" | "word" | "levenshtein" | "none";
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function wordMatch(queryWords: string[], candidateLower: string): boolean {
  return queryWords.every((w) => candidateLower.includes(w));
}

export function fuzzyLookup<T extends { name: string }>(
  query: string,
  exactMap: Map<string, T>,
  allItems: T[],
  options?: { maxSuggestions?: number },
): FuzzyResult<T> {
  const maxSuggestions = options?.maxSuggestions ?? 5;
  const queryLower = query.toLowerCase().trim();

  // Tier 1: Exact match
  const exact = exactMap.get(queryLower);
  if (exact) return { match: exact, suggestions: [], matchType: "exact" };

  // Tier 2: Substring match (skip for very short queries to avoid noise)
  if (queryLower.length >= 3) {
    const substringMatches = allItems.filter((item) => {
      const nameLower = item.name.toLowerCase();
      return nameLower.includes(queryLower) || queryLower.includes(nameLower);
    });
    if (substringMatches.length === 1) {
      return { match: substringMatches[0], suggestions: [], matchType: "substring" };
    }
    if (substringMatches.length > 1) {
      // Sort: prefer items where query is a prefix
      substringMatches.sort((a, b) => {
        const aPrefix = a.name.toLowerCase().startsWith(queryLower) ? 0 : 1;
        const bPrefix = b.name.toLowerCase().startsWith(queryLower) ? 0 : 1;
        return aPrefix - bPrefix || a.name.localeCompare(b.name);
      });
      return {
        match: null,
        suggestions: substringMatches.slice(0, maxSuggestions),
        matchType: "substring",
      };
    }
  }

  // Tier 3: Word match — all query words appear in candidate name
  const queryWords = queryLower.split(/\s+/).filter(Boolean);
  if (queryWords.length > 1) {
    const wordMatches = allItems.filter((item) => wordMatch(queryWords, item.name.toLowerCase()));
    if (wordMatches.length === 1) {
      return { match: wordMatches[0], suggestions: [], matchType: "word" };
    }
    if (wordMatches.length > 1) {
      return {
        match: null,
        suggestions: wordMatches.slice(0, maxSuggestions),
        matchType: "word",
      };
    }
  }

  // Tier 4: Levenshtein distance for typo tolerance
  const maxDist = Math.max(2, Math.floor(queryLower.length * 0.25));
  const scored = allItems
    .map((item) => ({ item, dist: levenshteinDistance(queryLower, item.name.toLowerCase()) }))
    .filter((e) => e.dist <= maxDist)
    .sort((a, b) => a.dist - b.dist);

  if (scored.length === 1) {
    return { match: scored[0].item, suggestions: [], matchType: "levenshtein" };
  }
  if (scored.length > 1) {
    // If top match is clearly better (2+ distance gap), auto-resolve
    if (scored[0].dist < scored[1].dist) {
      return { match: scored[0].item, suggestions: [], matchType: "levenshtein" };
    }
    return {
      match: null,
      suggestions: scored.slice(0, maxSuggestions).map((e) => e.item),
      matchType: "levenshtein",
    };
  }

  return { match: null, suggestions: [], matchType: "none" };
}
