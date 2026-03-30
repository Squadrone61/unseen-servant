import type { KnipConfig } from "knip";

const config: KnipConfig = {
  include: ["files", "exports", "types", "duplicates"],
  workspaces: {
    "packages/shared": {},
    "apps/web": {
      entry: ["src/app/**/*.{ts,tsx}"],
      project: ["src/**/*.{ts,tsx}"],
      next: true,
      // Tailwind v4 is imported via CSS (@import "tailwindcss"), not JS
      // postcss is used by @tailwindcss/postcss plugin
      ignoreDependencies: ["tailwindcss", "postcss"],
    },
    "apps/worker": {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
      // Cloudflare Workers runtime types provided by wrangler
      ignoreDependencies: ["cloudflare"],
    },
    "apps/mcp-bridge": {
      project: ["src/**/*.ts"],
    },
    "apps/dm-launcher": {
      entry: ["src/entry.ts"],
      project: ["src/**/*.ts"],
    },
  },
  ignore: ["scripts/**"],
};

export default config;
