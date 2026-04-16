/**
 * Expression Evaluator — Value Notation Language
 *
 * Evaluates value expressions used in the effect system. Supports:
 *   - Literals: 5, -2, 10
 *   - Ability modifiers: str, dex, con, int, wis, cha  → Math.floor((score - 10) / 2)
 *   - Context atoms: prof, lvl, clvl
 *   - Arithmetic: +, -, *  (standard precedence: * before +/-)
 *   - Functions:
 *       min(a, b), max(a, b)
 *       table(L:V, ...)     — class-level keyed lookup (uses clvl, falls back to totalLevel)
 *       table_lvl(L:V, ...) — character-level keyed lookup (always uses totalLevel)
 *       table_prof(P:V, ...) — proficiency-bonus keyed lookup (uses proficiencyBonus)
 *
 * Usage:
 *   evaluateExpression("10 + dex + con", ctx)           // 17
 *   evaluateExpression("table(1:2, 9:3, 16:4)", ctx)    // 3 at clvl 12
 *   evaluateExpression("table_lvl(1:2, 5:3, 11:4)", ctx) // 3 at totalLevel 7
 *   evaluateExpression("table_prof(2:1, 4:2, 6:3)", ctx) // 2 at profBonus 4
 */

import type { ResolveContext } from "../types/effects";

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

type TokenKind =
  | "number"
  | "ident"
  | "plus"
  | "minus"
  | "star"
  | "lparen"
  | "rparen"
  | "comma"
  | "colon"
  | "eof";

interface Token {
  kind: TokenKind;
  value: string;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }

    // Number literal (digits only — minus sign handled as unary operator)
    if (ch >= "0" && ch <= "9") {
      let num = "";
      while (i < src.length && src[i] >= "0" && src[i] <= "9") {
        num += src[i++];
      }
      tokens.push({ kind: "number", value: num });
      continue;
    }

    // Identifier: str, dex, con, int, wis, cha, prof, half_prof, lvl, clvl, min, max, table
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let ident = "";
      while (
        i < src.length &&
        ((src[i] >= "a" && src[i] <= "z") ||
          (src[i] >= "A" && src[i] <= "Z") ||
          (src[i] >= "0" && src[i] <= "9") ||
          src[i] === "_")
      ) {
        ident += src[i++];
      }
      tokens.push({ kind: "ident", value: ident });
      continue;
    }

    // Single-character tokens
    if (ch === "+") {
      tokens.push({ kind: "plus", value: "+" });
      i++;
      continue;
    }
    if (ch === "-") {
      tokens.push({ kind: "minus", value: "-" });
      i++;
      continue;
    }
    if (ch === "*") {
      tokens.push({ kind: "star", value: "*" });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", value: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ")" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma", value: "," });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ kind: "colon", value: ":" });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${ch}' in expression`);
  }

  tokens.push({ kind: "eof", value: "" });
  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive Descent Parser + Evaluator
// ---------------------------------------------------------------------------

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

class Parser {
  private tokens: Token[];
  private pos: number;
  private ctx: ResolveContext;

  constructor(tokens: Token[], ctx: ResolveContext) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(kind: TokenKind): Token {
    const tok = this.consume();
    if (tok.kind !== kind) {
      throw new Error(`Expected token '${kind}' but got '${tok.kind}' ('${tok.value}')`);
    }
    return tok;
  }

  /** Top-level entry point */
  parseExpr(): number {
    return this.parseAddSub();
  }

  /** additive: term (('+' | '-') term)* */
  private parseAddSub(): number {
    let left = this.parseMul();

    while (this.peek().kind === "plus" || this.peek().kind === "minus") {
      const op = this.consume();
      const right = this.parseMul();
      if (op.kind === "plus") {
        left += right;
      } else {
        left -= right;
      }
    }

    return left;
  }

  /** multiplicative: unary ('*' unary)* */
  private parseMul(): number {
    let left = this.parseUnary();

    while (this.peek().kind === "star") {
      this.consume();
      const right = this.parseUnary();
      left *= right;
    }

    return left;
  }

  /** unary: '-' primary | primary */
  private parseUnary(): number {
    if (this.peek().kind === "minus") {
      this.consume();
      return -this.parsePrimary();
    }
    return this.parsePrimary();
  }

  /** primary: number | ident | ident '(' args ')' | '(' expr ')' */
  private parsePrimary(): number {
    const tok = this.peek();

    if (tok.kind === "number") {
      this.consume();
      return parseInt(tok.value, 10);
    }

    if (tok.kind === "lparen") {
      this.consume();
      const val = this.parseExpr();
      this.expect("rparen");
      return val;
    }

    if (tok.kind === "ident") {
      this.consume();
      const name = tok.value.toLowerCase();

      // Function calls
      if (this.peek().kind === "lparen") {
        this.consume(); // consume '('
        if (name === "min") {
          const a = this.parseExpr();
          this.expect("comma");
          const b = this.parseExpr();
          this.expect("rparen");
          return Math.min(a, b);
        }
        if (name === "max") {
          const a = this.parseExpr();
          this.expect("comma");
          const b = this.parseExpr();
          this.expect("rparen");
          return Math.max(a, b);
        }
        if (name === "table") {
          return this.parseTable("class");
        }
        if (name === "table_lvl") {
          return this.parseTable("character");
        }
        if (name === "table_prof") {
          return this.parseTable("prof");
        }
        throw new Error(`Unknown function '${name}'`);
      }

      // Atoms
      return this.resolveAtom(name);
    }

    throw new Error(`Unexpected token '${tok.kind}' ('${tok.value}') in expression`);
  }

  /**
   * Parses a table(K:V, K:V, ...) expression — already consumed the function
   * name and the opening '('. Finds the highest entry where K ≤ key.
   * Returns 0 if no entry applies.
   *
   * keyType controls which context value is used as the lookup key:
   *   "class"     — clvl (classLevel ?? totalLevel)  — used by table()
   *   "character" — totalLevel                        — used by table_lvl()
   *   "prof"      — proficiencyBonus                  — used by table_prof()
   */
  private parseTable(keyType: "class" | "character" | "prof"): number {
    const entries: Array<{ level: number; value: number }> = [];

    // Parse zero or more K:V pairs separated by commas
    while (this.peek().kind !== "rparen" && this.peek().kind !== "eof") {
      // Key — may be negative (unlikely but handle it)
      let levelNeg = false;
      if (this.peek().kind === "minus") {
        this.consume();
        levelNeg = true;
      }
      const levelTok = this.expect("number");
      const level = levelNeg ? -parseInt(levelTok.value, 10) : parseInt(levelTok.value, 10);

      this.expect("colon");

      // Value — may be negative
      let valueNeg = false;
      if (this.peek().kind === "minus") {
        this.consume();
        valueNeg = true;
      }
      const valueTok = this.expect("number");
      const value = valueNeg ? -parseInt(valueTok.value, 10) : parseInt(valueTok.value, 10);

      entries.push({ level, value });

      if (this.peek().kind === "comma") {
        this.consume();
      }
    }

    this.expect("rparen");

    let key: number;
    switch (keyType) {
      case "class":
        key = this.ctx.classLevel ?? this.ctx.totalLevel;
        break;
      case "character":
        key = this.ctx.totalLevel;
        break;
      case "prof":
        key = this.ctx.proficiencyBonus;
        break;
    }

    // Find highest entry where entry.level ≤ key
    let result = 0;
    for (const entry of entries) {
      if (entry.level <= key) {
        result = entry.value;
      }
    }
    return result;
  }

  private resolveAtom(name: string): number {
    const { abilities, totalLevel, classLevel, proficiencyBonus, stackCount } = this.ctx;

    switch (name) {
      case "str":
        return abilityModifier(abilities.strength);
      case "dex":
        return abilityModifier(abilities.dexterity);
      case "con":
        return abilityModifier(abilities.constitution);
      case "int":
        return abilityModifier(abilities.intelligence);
      case "wis":
        return abilityModifier(abilities.wisdom);
      case "cha":
        return abilityModifier(abilities.charisma);
      case "prof":
        return proficiencyBonus;
      case "half_prof":
        return Math.floor(proficiencyBonus / 2);
      case "lvl":
        return totalLevel;
      case "clvl":
        return classLevel ?? totalLevel;
      case "stacks":
        return stackCount ?? 1;
      default:
        throw new Error(`Unknown identifier '${name}' in expression`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a value expression against a resolve context.
 *
 * @param expr  A number (returned as-is) or a string expression like "10 + dex + con".
 * @param ctx   The character context to resolve atoms against.
 * @returns     The evaluated numeric result.
 */
export function evaluateExpression(expr: number | string, ctx: ResolveContext): number {
  if (typeof expr === "number") return expr;

  const tokens = tokenize(expr);
  const parser = new Parser(tokens, ctx);
  const result = parser.parseExpr();

  if (parser["peek"]().kind !== "eof") {
    throw new Error(`Unexpected trailing tokens in expression: '${expr}'`);
  }

  return result;
}
