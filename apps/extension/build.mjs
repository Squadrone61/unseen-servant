import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const entries = ["popup", "content", "background"];

const commonOptions = {
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
};

if (watch) {
  for (const entry of entries) {
    const ctx = await context({
      ...commonOptions,
      entryPoints: [`src/${entry}.ts`],
      outfile: `dist/${entry}.js`,
    });
    await ctx.watch();
  }
  console.log("Watching for changes...");
} else {
  for (const entry of entries) {
    await build({
      ...commonOptions,
      entryPoints: [`src/${entry}.ts`],
      outfile: `dist/${entry}.js`,
    });
  }
  console.log("Build complete.");
}
