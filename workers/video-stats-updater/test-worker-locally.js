#!/usr/bin/env node
import worker from './src/index.js';

// Mock environment
const mockEnv = {
  R2_BUCKET: {
    get: async (key) => {
      console.log(`[R2] Getting: ${key}`);
      
      // Mock metadata
      if (key === 'rankings/metadata.json') {
        return {
          text: async () => JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            tagsByGenrePeriod: {
              'all/24h': { tags: [], updatedAt: new Date().toISOString() },
              'all/hour': { tags: [], updatedAt: new Date().toISOString() },
            }
          }),
          json: async () => ({
            version: 1,
            updatedAt: new Date().toISOString(),
            tagsByGenrePeriod: {
              'all/24h': { tags: [], updatedAt: new Date().toISOString() },
              'all/hour': { tags: [], updatedAt: new Date().toISOString() },
            }
          })
        };
      }
      
      // Mock ranking data
      if (key === 'rankings/all/24h/all.json') {
        return {
          text: async () => JSON.stringify({
            items: [
              { id: 'sm1', title: 'Test Video 1' },
              { id: 'sm2', title: 'Test Video 2' },
            ],
            metadata: { genre: 'all', period: '24h' }
          }),
          json: async () => ({
            items: [
              { id: 'sm1', title: 'Test Video 1' },
              { id: 'sm2', title: 'Test Video 2' },
            ],
            metadata: { genre: 'all', period: '24h' }
          })
        };
      }
      
      return null;
    }
  },
  STATS_KV: {
    put: async (key, value) => {
      console.log(`[KV] Putting key: ${key}`);
      const data = JSON.parse(value);
      console.log(`[KV] Data:`, {
        version: data.metadata?.version,
        updatedAt: data.metadata?.updatedAt,
        totalVideos: data.metadata?.totalVideos,
        videoIds: Object.keys(data.stats || {})
      });
    }
  },
  SNAPSHOT_API_KEY: 'test-key'
};

// Mock controller
const mockController = {};

// Mock context
const mockCtx = {
  waitUntil: (promise) => {
    console.log('[CTX] waitUntil called');
  }
};

// Run the worker
console.log('🚀 Testing Worker locally...\n');

try {
  await worker.scheduled(mockController, mockEnv, mockCtx);
  console.log('\n✅ Worker completed successfully');
} catch (error) {
  console.error('\n❌ Worker failed:', error);
}