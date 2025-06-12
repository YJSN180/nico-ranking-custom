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
        lines: 41,
        branches: 41,
        functions: 41,
        statements: 41
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
})