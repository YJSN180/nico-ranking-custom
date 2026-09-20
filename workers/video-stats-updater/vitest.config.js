import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2024-01-01',
        compatibilityFlags: ['nodejs_compat', 'nodejs_zlib'],
        kvNamespaces: ['STATS_KV'],
        r2Buckets: ['R2_BUCKET'],
        bindings: { SNAPSHOT_API_KEY: 'test-api-key' },
      },
    }),
  ],
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: ['node_modules/**', 'test/**', '**/*.test.js', '**/*.spec.js'],
    },
    testTimeout: 30000,
  },
})
