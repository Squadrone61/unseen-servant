/**
 * AI Dungeon Master Launcher — dual-mode single file.
 *
 * `node aidnd-dm.mjs`          → CLI mode: prompts for room code, spawns Claude Code
 * `node aidnd-dm.mjs --serve`  → Server mode: runs MCP bridge (stdio)
 */

const isServeMode = process.argv.includes("--serve");

if (isServeMode) {
  const { startServer } = await import("./server.js");
  await startServer();
} else {
  const { startCli } = await import("./cli.js");
  await startCli();
}
