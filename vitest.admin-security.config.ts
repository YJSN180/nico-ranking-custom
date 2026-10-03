import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, '.') } },
  test: {
    environment: 'node', globals: true, maxWorkers: 1,
    include: [
      '__tests__/unit/workers-upstream-security.test.ts',
      '__tests__/unit/workers-green-gateway.test.ts',
      '__tests__/unit/workers-blue-gateway.test.ts',
      '__tests__/unit/workers-config.test.ts',
      '__tests__/unit/smart-router-*.test.ts',
    ],
  },
})
