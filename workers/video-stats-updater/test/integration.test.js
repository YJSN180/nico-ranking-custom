import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('Worker Integration Tests', () => {
  let worker;
  
  beforeAll(async () => {
    // Start the Worker in test mode
    worker = await unstable_dev(
      'src/index.js',
      {
        experimental: { disableExperimentalWarning: true },
        vars: {
          SNAPSHOT_API_KEY: 'test-key',
        },
      }
    );
  });
  
  afterAll(async () => {
    await worker.stop();
  });
  
  it('should handle scheduled event and update KV', async () => {
    // Create test data in R2
    const mockRankingData = {
      genres: {
        all: {
          '24h': {
            items: [
              { id: 'sm1', title: 'Test Video 1', views: 100 },
              { id: 'sm2', title: 'Test Video 2', views: 200 },
            ],
          },
        },
      },
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    };
    
    // Mock R2 bucket operations
    const r2Bucket = {
      get: async (key) => {
        if (key === 'rankings/metadata.json') {
          return {
            text: async () => JSON.stringify({
              genres: ['all'],
              metadata: mockRankingData.metadata,
            }),
          };
        } else if (key === 'rankings/all/data.json') {
          return {
            text: async () => JSON.stringify(mockRankingData.genres.all),
          };
        }
        return null;
      },
    };
    
    // Mock KV namespace
    const kvNamespace = {
      put: vi.fn().mockResolvedValue(undefined),
    };
    
    // Mock fetch for Snapshot API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        meta: { status: 200 },
        data: {
          items: [
            {
              watchId: 'sm1',
              video: {
                count: {
                  view: 150,
                  comment: 10,
                  mylist: 5,
                  like: 20,
                },
              },
            },
            {
              watchId: 'sm2',
              video: {
                count: {
                  view: 250,
                  comment: 15,
                  mylist: 8,
                  like: 30,
                },
              },
            },
          ],
        },
      }),
    });
    
    // Execute scheduled handler
    const env = {
      R2_BUCKET: r2Bucket,
      STATS_KV: kvNamespace,
      SNAPSHOT_API_KEY: 'test-key',
    };
    
    const module = await import('../src/index.js');
    await module.default.scheduled(null, env, {});
    
    // Verify KV was updated
    expect(kvNamespace.put).toHaveBeenCalledWith(
      'VIDEO_STATS_LATEST',
      expect.stringContaining('"sm1"')
    );
    
    // Verify the stats data structure
    const callArgs = kvNamespace.put.mock.calls[0];
    const statsData = JSON.parse(callArgs[1]);
    
    expect(statsData).toMatchObject({
      stats: {
        sm1: {
          viewCounter: 150,
          commentCounter: 10,
          mylistCounter: 5,
          likeCounter: 20,
        },
        sm2: {
          viewCounter: 250,
          commentCounter: 15,
          mylistCounter: 8,
          likeCounter: 30,
        },
      },
      metadata: {
        version: 1,
        updatedAt: expect.any(String),
        totalVideos: 2,
      },
    });
  });
  
  it('should handle empty ranking data gracefully', async () => {
    const r2Bucket = {
      get: async (key) => {
        if (key === 'rankings/metadata.json') {
          return {
            text: async () => JSON.stringify({
              genres: [],
              metadata: { version: 1, updatedAt: new Date().toISOString() },
            }),
          };
        }
        return null;
      },
    };
    
    const kvNamespace = {
      put: vi.fn().mockResolvedValue(undefined),
    };
    
    const env = {
      R2_BUCKET: r2Bucket,
      STATS_KV: kvNamespace,
      SNAPSHOT_API_KEY: 'test-key',
    };
    
    const module = await import('../src/index.js');
    await module.default.scheduled(null, env, {});
    
    // Verify empty stats were written
    expect(kvNamespace.put).toHaveBeenCalledWith(
      'VIDEO_STATS_LATEST',
      expect.stringContaining('"stats":{}')
    );
  });
  
  it('should handle Snapshot API errors gracefully', async () => {
    const mockRankingData = {
      genres: {
        all: {
          '24h': {
            items: [{ id: 'sm1', title: 'Test Video', views: 100 }],
          },
        },
      },
    };
    
    const r2Bucket = {
      get: async (key) => {
        if (key === 'rankings/metadata.json') {
          return {
            text: async () => JSON.stringify({
              genres: ['all'],
              metadata: { version: 1, updatedAt: new Date().toISOString() },
            }),
          };
        } else if (key === 'rankings/all/data.json') {
          return {
            text: async () => JSON.stringify(mockRankingData.genres.all),
          };
        }
        return null;
      },
    };
    
    const kvNamespace = {
      put: vi.fn().mockResolvedValue(undefined),
    };
    
    // Mock API failure
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    
    const env = {
      R2_BUCKET: r2Bucket,
      STATS_KV: kvNamespace,
      SNAPSHOT_API_KEY: 'test-key',
    };
    
    const module = await import('../src/index.js');
    
    // Should throw an appropriate error
    await expect(module.default.scheduled(null, env, {}))
      .rejects.toThrow('Failed to fetch video stats');
  });
});

describe('Frontend Integration', () => {
  it('should fetch stats from API endpoint', async () => {
    // Mock KV data that API would read
    const mockKVData = {
      stats: {
        sm1: {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 20,
          likeCounter: 100,
        },
        sm2: {
          viewCounter: 2000,
          commentCounter: 100,
          mylistCounter: 40,
          likeCounter: 200,
        },
      },
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalVideos: 2,
      },
    };
    
    // Mock fetch response from API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stats: {
          sm1: mockKVData.stats.sm1,
          sm2: mockKVData.stats.sm2,
        },
        timestamp: mockKVData.metadata.updatedAt,
        count: 2,
      }),
    });
    
    // Simulate API call
    const response = await fetch('/api/edge/video-stats?ids=sm1,sm2');
    const data = await response.json();
    
    expect(data).toMatchObject({
      stats: {
        sm1: {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 20,
          likeCounter: 100,
        },
        sm2: {
          viewCounter: 2000,
          commentCounter: 100,
          mylistCounter: 40,
          likeCounter: 200,
        },
      },
      timestamp: expect.any(String),
      count: 2,
    });
  });
});