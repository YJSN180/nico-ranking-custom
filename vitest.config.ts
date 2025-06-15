import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    exclude: ['**/node_modules/**', '**/__tests__/e2e/**'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'coverage/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '__tests__/**',
        'app/admin/**',
        'app/api/admin/**',
        'app/api/debug/**',
        'app/api/test-scraping/**',
        'app/layout.tsx',
        'app/privacy/**',
        'app/admin/setup-mfa/**',
        'app/api/admin/mfa/**',
        'components/footer.tsx',
        'components/web-vitals-reporter.tsx',
        'lib/totp.ts',
        'lib/web-vitals.ts',
        'lib/data-fetcher.ts',
        'lib/popular-tags.ts',
        'lib/nico-api.ts',
        'lib/fetch-ranking.ts',
        'lib/date-utils.ts',
        'lib/html-parser.ts',
        'lib/update-ranking.ts',
        'scripts/**',
        'types/**',
        'components/icons.tsx',
        'playwright.config.ts',
        'workers/**',
        '.next/**',
        'public/**',
        '**/*.css',
        '**/*.json',
        'middleware.ts',
        'pages-build-blocker.js',
        'instrumentation.ts'
      ],
      thresholds: {
        lines: 40,
        branches: 40,
        functions: 40,
        statements: 40
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
})