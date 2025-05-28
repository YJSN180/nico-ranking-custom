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
        'app/api/cron/status/**',
        'app/layout.tsx',
        'lib/data-fetcher.ts',
        'types/**',
        'playwright.config.ts'
      ],
      thresholds: {
        lines: 65,
        branches: 65,
        functions: 65,
        statements: 65
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
})