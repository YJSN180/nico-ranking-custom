import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignores - must be first
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      ".wrangler/**",
      "dist/**",
      // Test files
      "__tests__/**",
      "tests/**",
      "*.test.ts",
      "*.test.tsx",
      "*.spec.ts",
      "*.spec.tsx",
      // Scripts
      "scripts/**",
      // Workers (have their own lint rules)
      "workers/**",
      // GitHub Actions scripts
      ".github/**",
      // Config files
      "*.config.js",
      "*.config.mjs",
      "*.config.cjs",
      "next.config.ts",
      "vitest.config.ts",
      "playwright.config.ts",
      // Debug/test scripts in root
      "test-*.js",
      "test-*.mjs",
      "debug-*.js",
      "monitor-*.ts",
      "pages-build-blocker.js",
      // Service worker
      "public/sw-*.js",
      // TODO: Fix React Hooks rules violation in this file
      "hooks/use-custom-rankings-indexeddb.ts",
    ],
  },
  // Extend next/core-web-vitals
  ...compat.extends("next/core-web-vitals"),
  // Custom rules for source files
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
];

export default eslintConfig;
