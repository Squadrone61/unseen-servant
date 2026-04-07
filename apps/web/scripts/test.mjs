// Start dev servers, run Playwright tests, then clean up.
// Usage: node scripts/test.mjs [playwright args...]

import { spawn } from "child_process";
import { get } from "http";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..", "..");

const args = process.argv.slice(2);
const procs = [];

function cleanup() {
  for (const p of procs) {
    try {
      p.kill();
    } catch {}
  }
}
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(1);
});

function startProc(cmd, cmdArgs, opts = {}) {
  const p = spawn(cmd, cmdArgs, { stdio: "inherit", shell: true, ...opts });
  procs.push(p);
  return p;
}

function waitForServer(url, timeoutSec = 60) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutSec * 1000;
    function check() {
      if (Date.now() > deadline) return reject(new Error(`Timeout waiting for ${url}`));
      get(url, (res) => {
        res.resume();
        resolve();
      }).on("error", () => setTimeout(check, 1000));
    }
    check();
  });
}

// Start dev servers from the repo root
console.log("Starting dev servers...");
startProc("pnpm", ["dev:all"], { cwd: rootDir });

try {
  console.log("Waiting for worker (localhost:8787)...");
  await waitForServer("http://localhost:8787");
  console.log("Waiting for web (localhost:3000)...");
  await waitForServer("http://localhost:3000");
  console.log("Dev servers ready. Running tests...");

  const test = spawn("npx", ["playwright", "test", ...args], {
    stdio: "inherit",
    shell: true,
  });

  const code = await new Promise((resolve) => test.on("close", resolve));
  cleanup();
  process.exit(code);
} catch (err) {
  console.error(err.message);
  cleanup();
  process.exit(1);
}
