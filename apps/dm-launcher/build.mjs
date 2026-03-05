import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf-8")
);

const result = await esbuild.build({
  entryPoints: [path.join(__dirname, "src/entry.ts")],
  outfile: path.join(__dirname, "dist/aidnd-dm.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  minify: false,
  sourcemap: false,
  // Keep readable for debugging
  keepNames: true,

  // Node builtins are external (available at runtime)
  // Also exclude optional native WebSocket deps
  external: [
    "bufferutil",
    "utf-8-validate",
  ],

  // Resolve npm packages from mcp-bridge and root node_modules
  nodePaths: [
    path.resolve(__dirname, "../mcp-bridge/node_modules"),
    path.resolve(__dirname, "../../node_modules"),
  ],

  // Resolve workspace dependency at build time
  alias: {
    "@aidnd/shared": path.resolve(__dirname, "../../packages/shared/src"),
  },

  // Inject build-time constants
  define: {
    PRODUCTION_WORKER_URL: JSON.stringify(
      "https://aidnd-worker.safats61.workers.dev"
    ),
    AIDND_VERSION: JSON.stringify(pkg.version),
  },

  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __createRequire } from 'module';",
      "const require = __createRequire(import.meta.url);",
      "",
    ].join("\n"),
  },

  // Log output
  logLevel: "info",
});

const outPath = path.join(__dirname, "dist/aidnd-dm.mjs");
const stat = fs.statSync(outPath);
const sizeKB = (stat.size / 1024).toFixed(0);
console.log(`\n✓ Built dist/aidnd-dm.mjs (${sizeKB} KB)`);
