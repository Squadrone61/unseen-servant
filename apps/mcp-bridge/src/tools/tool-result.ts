/**
 * Shared result builders for MCP tool handlers.
 *
 * Every tool returns a dual-format text block:
 *   Line 1+  — human-readable summary (backwards-compatible)
 *   ---       — separator
 *   JSON     — machine-parseable structured data
 *
 * When `data` is omitted the separator and JSON block are skipped,
 * so existing tools can adopt buildResult() incrementally.
 */

export interface ToolResultOpts {
  /** Human-readable summary line(s) */
  text: string;
  /** Structured data appended as JSON after the --- separator */
  data?: Record<string, unknown>;
}

export interface CallToolResult {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Build a successful tool result with optional structured data.
 */
export function buildResult(opts: ToolResultOpts): CallToolResult {
  let text = opts.text;
  if (opts.data !== undefined) {
    text += "\n---\n" + JSON.stringify(opts.data);
  }
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Build an error tool result with recovery hints.
 */
export function buildError(text: string, hints?: string[]): CallToolResult {
  let full = text;
  if (hints && hints.length > 0) {
    full += "\n> " + hints.join("\n> ");
  }
  return { content: [{ type: "text" as const, text: full }], isError: true };
}
