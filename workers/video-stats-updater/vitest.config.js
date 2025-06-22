import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.js',
        '**/*.spec.js',
      ],
    },
    testTimeout: 30000,
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: '2024-01-01',
          kvNamespaces: ['STATS_KV'],
          r2Buckets: ['R2_BUCKET'],
          bindings: {
            SNAPSHOT_API_KEY: 'test-api-key',
          },
        },
      },
    },
  },
});