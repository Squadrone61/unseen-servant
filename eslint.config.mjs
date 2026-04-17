import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import prettierConfig from "eslint-config-prettier";
import tailwindcss from "eslint-plugin-tailwindcss";

const __dirname = dirname(fileURLToPath(import.meta.url));
const twConfig = resolve(__dirname, "apps/web/src/app/globals.css");

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/.wrangler/**",
      "**/.turbo/**",
      "**/worker-configuration.d.ts",
      "apps/dm-launcher/build.mjs",
      "scripts/**",
      ".testing/**",
    ],
  },

  // Base: ESLint recommended
  js.configs.recommended,

  // TypeScript: strict rules for all .ts/.tsx
  ...tseslint.configs.strict,

  // All TS/TSX files
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-dynamic-delete": "off",
      "no-console": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // apps/web: React hooks + Next.js rules
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Disable React Compiler rules (we don't use the compiler)
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // Server-side code: console is expected
  {
    files: ["apps/mcp-bridge/**/*.ts", "apps/dm-launcher/**/*.ts", "apps/worker/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Test files: relaxed rules
  {
    files: ["tests/**/*.ts", "apps/web/tests/**/*.ts", "apps/mcp-bridge/src/__tests__/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // Tailwind CSS rules for frontend
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    plugins: {
      tailwindcss: tailwindcss,
    },
    settings: {
      tailwindcss: {
        config: twConfig,
        cssFiles: ["apps/web/src/app/globals.css"],
      },
    },
    rules: {
      "tailwindcss/no-arbitrary-value": "error",
      "tailwindcss/classnames-order": "error",
      "tailwindcss/no-contradicting-classname": "error",
      "tailwindcss/no-unnecessary-arbitrary-value": "error",
      "tailwindcss/enforces-shorthand": "warn",
      "tailwindcss/no-custom-classname": "off",
    },
  },

  // Prettier must be last
  prettierConfig,
);
