import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// Modify the Next.js configs to add our custom rules
const modifiedConfigs = nextCoreWebVitals.map(config => {
  if (config.name === "next" && config.rules) {
    return {
      ...config,
      rules: {
        ...config.rules,
        // Custom rule overrides
        "no-console": ["error", { allow: ["warn", "error"] }],
        "react-hooks/exhaustive-deps": "warn",
        "@next/next/no-img-element": "warn",
      },
    };
  }
  return config;
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
  // Use the modified Next.js configs
  ...modifiedConfigs,
];

export default eslintConfig;