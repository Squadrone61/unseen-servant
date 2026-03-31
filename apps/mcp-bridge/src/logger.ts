/**
 * Timestamped logger for MCP bridge.
 * All output goes to stderr (same as previous console.error calls)
 * so it doesn't interfere with MCP stdio transport on stdout.
 */

function ts(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function log(tag: string, msg: string, ...args: unknown[]): void {
  console.error(`[${ts()}] [${tag}] ${msg}`, ...args);
}
