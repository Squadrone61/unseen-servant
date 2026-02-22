/**
 * Build the extension for release (no sourcemaps, minified) and package into a zip.
 * Usage: node release.mjs
 * Output: aidnd-extension-v{version}.zip
 */

import { build } from "esbuild";
import { readFileSync, cpSync, rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const version = manifest.version;
const zipName = `aidnd-extension-v${version}.zip`;
const stageDir = ".release-stage";

// Build without sourcemaps for production
const entries = ["popup", "content", "background"];
for (const entry of entries) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/${entry}.js`,
    bundle: true,
    format: "esm",
    target: "chrome120",
    sourcemap: false,
    minify: true,
  });
}
console.log("Built production bundles.");

// Stage files preserving directory structure
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true });
mkdirSync(stageDir, { recursive: true });

const filesToZip = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "dist/popup.js",
  "dist/content.js",
  "dist/background.js",
];

for (const f of filesToZip) {
  if (!existsSync(f)) {
    console.error(`Missing file: ${f}`);
    process.exit(1);
  }
  const dest = join(stageDir, f);
  mkdirSync(join(dest, ".."), { recursive: true });
  cpSync(f, dest);
}

// Zip the staged directory
if (existsSync(zipName)) rmSync(zipName);

const isWindows = process.platform === "win32";
if (isWindows) {
  const absStage = join(process.cwd(), stageDir).replace(/\//g, "\\");
  const absZip = join(process.cwd(), zipName).replace(/\//g, "\\");
  execSync(
    `powershell -Command "Compress-Archive -Path '${absStage}\\*' -DestinationPath '${absZip}' -Force"`,
    { stdio: "inherit" },
  );
} else {
  execSync(`cd ${stageDir} && zip -r ../${zipName} .`, { stdio: "inherit" });
}

// Clean up
rmSync(stageDir, { recursive: true });

console.log(`Packaged: ${zipName} (v${version})`);
