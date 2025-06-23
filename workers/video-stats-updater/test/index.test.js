import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMockBindings, setupSnapshotAPIMock, flushPromises } from './helpers';
import { 
  mockRankingMetadata, 
  mockRankingData,
  mockRankingDataHour, 
  mockVideoStats,
  mockEmptyRankingData 
} from './mocks';

import worker from '../src/index.js';

describe('Video Stats Updater Worker', () => {
  let env;
  let ctx;

  beforeEach(() => {
    vi.clearAllMocks();
    
    env = {
      SNAPSHOT_API_KEY: 'test-api-key',
    };
    env = setupMockBindings(env);
    
    ctx = {
      waitUntil: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scheduled handler', () => {
    it('should fetch ranking data from R2 and update video stats in KV', async () => {
      // Setup R2 mock data
      env.R2_BUCKET._storage.set('rankings/metadata.json', mockRankingMetadata);
      env.R2_BUCKET._storage.set('rankings/all/24h/all.json', mockRankingData);
      env.R2_BUCKET._storage.set('rankings/all/hour/all.json', mockRankingDataHour);
      env.R2_BUCKET._storage.set('rankings/anime/24h/all.json', mockRankingData);
      env.R2_BUCKET._storage.set('rankings/anime/hour/all.json', mockRankingDataHour);
      env.R2_BUCKET._storage.set('rankings/music/24h/all.json', mockEmptyRankingData);
      env.R2_BUCKET._storage.set('rankings/music/hour/all.json', mockEmptyRankingData);

      // Setup Snapshot API mock
      setupSnapshotAPIMock({
        'sm1,sm2,sm3': {
          data: [
            {
              contentId: 'sm1',
              viewCounter: 1000,
              commentCounter: 50,
              mylistCounter: 20,
              likeCounter: 100,
              tags: 'test video',
            },
            {
              contentId: 'sm2',
              viewCounter: 2000,
              commentCounter: 100,
              mylistCounter: 40,
              likeCounter: 200,
              tags: 'test popular',
            },
            {
              contentId: 'sm3',
              viewCounter: 500,
              commentCounter: 25,
              mylistCounter: 10,
              likeCounter: 50,
              tags: 'test new',
            },
          ],
        },
      });

      // Execute the scheduled handler
      await worker.scheduled(null, env, ctx);
      await flushPromises();

      // Verify R2 reads
      expect(env.R2_BUCKET.get).toHaveBeenCalledWith('rankings/metadata.json');
      expect(env.R2_BUCKET.get).toHaveBeenCalledWith('rankings/all/24h/all.json');
      expect(env.R2_BUCKET.get).toHaveBeenCalledWith('rankings/all/hour/all.json');
      expect(env.R2_BUCKET.get).toHaveBeenCalledWith('rankings/anime/24h/all.json');
      expect(env.R2_BUCKET.get).toHaveBeenCalledWith('rankings/anime/hour/all.json');
      expect(env.R2_BUCKET.get).toHaveBeenCalledWith('rankings/music/24h/all.json');
      expect(env.R2_BUCKET.get).toHaveBeenCalledWith('rankings/music/hour/all.json');

      // Verify KV write
      expect(env.STATS_KV.put).toHaveBeenCalledTimes(1);
      expect(env.STATS_KV.put).toHaveBeenCalledWith(
        'VIDEO_STATS_LATEST',
        expect.any(String)
      );

      // Verify the written data structure
      const writtenData = JSON.parse(env.STATS_KV.put.mock.calls[0][1]);
      expect(writtenData).toMatchObject({
        stats: {
          sm1: {
            viewCounter: 1000,
            commentCounter: 50,
            mylistCounter: 20,
            likeCounter: 100,
            tags: ['test', 'video'],
          },
          sm2: {
            viewCounter: 2000,
            commentCounter: 100,
            mylistCounter: 40,
            likeCounter: 200,
            tags: ['test', 'popular'],
          },
          sm3: {
            viewCounter: 500,
            commentCounter: 25,
            mylistCounter: 10,
            likeCounter: 50,
            tags: ['test', 'new'],
          },
        },
        metadata: {
          version: 1,
          updatedAt: expect.any(String),
          totalVideos: 3,
        },
      });
    });

    it('should handle empty ranking data', async () => {
      // Setup R2 with empty data
      env.R2_BUCKET._storage.set('rankings/metadata.json', mockRankingMetadata);
      env.R2_BUCKET._storage.set('rankings/all/24h/all.json', mockEmptyRankingData);
      env.R2_BUCKET._storage.set('rankings/all/hour/all.json', mockEmptyRankingData);

      await worker.scheduled(null, env, ctx);
      await flushPromises();

      // Should still write to KV with empty stats
      expect(env.STATS_KV.put).toHaveBeenCalledWith(
        'VIDEO_STATS_LATEST',
        expect.any(String)
      );

      const writtenData = JSON.parse(env.STATS_KV.put.mock.calls[0][1]);
      expect(writtenData).toMatchObject({
        stats: {},
        metadata: {
          version: 1,
          updatedAt: expect.any(String),
          totalVideos: 0,
        },
      });
    });

    it('should handle R2 errors gracefully', async () => {
      // Make R2 get throw an error
      env.R2_BUCKET.get = vi.fn().mockRejectedValue(new Error('R2 error'));

      await expect(worker.scheduled(null, env, ctx)).rejects.toThrow('Failed to fetch ranking metadata');
      
      // Should not write to KV on error
      expect(env.STATS_KV.put).not.toHaveBeenCalled();
    });

    it('should handle Snapshot API errors gracefully', async () => {
      // Setup R2 mock data
      env.R2_BUCKET._storage.set('rankings/metadata.json', mockRankingMetadata);
      env.R2_BUCKET._storage.set('rankings/all/24h/all.json', mockRankingData);
      env.R2_BUCKET._storage.set('rankings/all/hour/all.json', mockRankingDataHour);

      // Make fetch throw an error
      global.fetch = vi.fn().mockRejectedValue(new Error('API error'));

      await expect(worker.scheduled(null, env, ctx)).rejects.toThrow('Failed to fetch video stats');
      
      // Should not write to KV on error
      expect(env.STATS_KV.put).not.toHaveBeenCalled();
    });

    it('should batch API requests for large number of videos', async () => {
      // Create mock data with many videos
      const manyVideos = {
        '24h': {
          items: Array.from({ length: 150 }, (_, i) => ({
            id: `sm${i + 1}`,
            title: `Video ${i + 1}`,
          })),
        },
        'hour': { items: [] },
      };

      env.R2_BUCKET._storage.set('rankings/metadata.json', mockRankingMetadata);
      env.R2_BUCKET._storage.set('rankings/all/24h/all.json', manyVideos);
      env.R2_BUCKET._storage.set('rankings/all/hour/all.json', manyVideos);

      // Mock API responses for batches
      global.fetch = vi.fn(async (url) => {
        const urlString = url.toString();
        if (urlString.includes('api.search.nicovideo.jp')) {
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      await worker.scheduled(null, env, ctx);
      await flushPromises();

      // Verify that fetch was called multiple times (batching)
      // 150 videos / 50 per batch = 3 calls
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});