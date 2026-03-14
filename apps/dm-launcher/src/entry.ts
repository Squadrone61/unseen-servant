/**
 * Unseen Servant Launcher — dual-mode single file.
 *
 * `node unseen-servant.mjs`          → CLI mode: prompts for room code, spawns Claude Code
 * `node unseen-servant.mjs --serve`  → Server mode: runs MCP bridge (stdio)
 */

export {};

const isServeMode = process.argv.includes("--serve");

if (isServeMode) {
  const { startServer } = await import("./server.js");
  await startServer();
} else {
  const { startCli } = await import("./cli.js");
  await startCli();
}
