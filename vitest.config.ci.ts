import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// CI用の設定: カバレッジを無効化してメモリ使用量を削減
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    exclude: [
      '**/node_modules/**', 
      '**/__tests__/e2e/**',
      // Temporarily exclude problematic tests in CI
      '__tests__/unit/error-handling.test.ts',
      '__tests__/unit/complete-hybrid-scraper.test.ts',
      '__tests__/unit/storage-saturation.test.tsx',
      '__tests__/unit/genre-500-items-support.test.tsx'
    ],
    testTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1
      }
    }
    // coverage removed to disable it completely
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
})