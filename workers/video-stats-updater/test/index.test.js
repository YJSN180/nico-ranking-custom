import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMockBindings, setupSnapshotAPIMock, flushPromises } from './helpers';
import { 
  mockRankingMetadata, 
  mockRankingData,
  mockRankingDataHour, 
  mockEmptyRankingData,
  createStoredMockR2Object,
} from './mocks';

import worker from '../src/index.js';

describe('Video Stats Updater Worker', () => {
  let env;
  let ctx;

  async function getScheduledJobPromise() {
    await flushPromises();
    return ctx.waitUntil.mock.calls[0]?.[0];
  }

  async function runScheduled() {
    await worker.scheduled(
      { cron: '*/5 * * * *', scheduledTime: Date.parse('2026-04-21T04:00:00Z') },
      env,
      ctx,
    );
    const jobPromise = await getScheduledJobPromise();
    await jobPromise;
  }

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
      await runScheduled();

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

      await runScheduled();

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

    it('should read gzipped metadata from R2', async () => {
      env.R2_BUCKET._storage.set(
        'rankings/metadata.json',
        await createStoredMockR2Object(mockRankingMetadata, {
          gzip: true,
          contentEncoding: 'gzip',
        }),
      );
      env.R2_BUCKET._storage.set('rankings/all/24h/all.json', mockRankingData);
      env.R2_BUCKET._storage.set('rankings/all/hour/all.json', mockRankingDataHour);

      setupSnapshotAPIMock({
        'sm1,sm2,sm3': {
          data: [
            { contentId: 'sm1', viewCounter: 1, commentCounter: 2, mylistCounter: 3, likeCounter: 4, tags: 'a b' },
            { contentId: 'sm2', viewCounter: 5, commentCounter: 6, mylistCounter: 7, likeCounter: 8, tags: 'c d' },
            { contentId: 'sm3', viewCounter: 9, commentCounter: 10, mylistCounter: 11, likeCounter: 12, tags: 'e f' },
          ],
        },
      });

      await runScheduled();

      expect(env.STATS_KV.put).toHaveBeenCalledTimes(1);
      const writtenData = JSON.parse(env.STATS_KV.put.mock.calls[0][1]);
      expect(writtenData.metadata.totalVideos).toBe(3);
    });

    it('should read gzipped ranking data even without contentEncoding metadata', async () => {
      env.R2_BUCKET._storage.set('rankings/metadata.json', mockRankingMetadata);
      env.R2_BUCKET._storage.set(
        'rankings/all/24h/all.json',
        await createStoredMockR2Object(mockRankingData, { gzip: true }),
      );
      env.R2_BUCKET._storage.set(
        'rankings/all/hour/all.json',
        await createStoredMockR2Object(mockRankingDataHour, { gzip: true }),
      );

      setupSnapshotAPIMock({
        'sm1,sm2,sm3': {
          data: [
            { contentId: 'sm1', viewCounter: 1, commentCounter: 2, mylistCounter: 3, likeCounter: 4, tags: 'a b' },
            { contentId: 'sm2', viewCounter: 5, commentCounter: 6, mylistCounter: 7, likeCounter: 8, tags: 'c d' },
            { contentId: 'sm3', viewCounter: 9, commentCounter: 10, mylistCounter: 11, likeCounter: 12, tags: 'e f' },
          ],
        },
      });

      await runScheduled();

      expect(env.STATS_KV.put).toHaveBeenCalledTimes(1);
      const writtenData = JSON.parse(env.STATS_KV.put.mock.calls[0][1]);
      expect(writtenData.metadata.totalVideos).toBe(3);
    });

    it('should handle R2 errors gracefully', async () => {
      // Make R2 get throw an error
      env.R2_BUCKET.get = vi.fn().mockRejectedValue(new Error('R2 error'));

      await runScheduled();

      expect(env.STATS_KV.put).toHaveBeenCalledTimes(1);
      const writtenData = JSON.parse(env.STATS_KV.put.mock.calls[0][1]);
      expect(writtenData).toMatchObject({
        stats: {},
        metadata: {
          totalVideos: 0,
        },
      });
    });

    it('should handle Snapshot API errors gracefully', async () => {
      // Setup R2 mock data
      env.R2_BUCKET._storage.set('rankings/metadata.json', mockRankingMetadata);
      env.R2_BUCKET._storage.set('rankings/all/24h/all.json', mockRankingData);
      env.R2_BUCKET._storage.set('rankings/all/hour/all.json', mockRankingDataHour);

      // Make fetch throw an error
      global.fetch = vi.fn().mockRejectedValue(new Error('API error'));

      await runScheduled();

      expect(env.STATS_KV.put).toHaveBeenCalledTimes(1);
      const writtenData = JSON.parse(env.STATS_KV.put.mock.calls[0][1]);
      expect(writtenData).toMatchObject({
        stats: {},
        metadata: {
          totalVideos: 0,
        },
      });
    });

    it('should batch API requests for large number of videos', async () => {
      const manyVideos24h = {
        items: Array.from({ length: 150 }, (_, i) => ({
          id: `sm${i + 1}`,
          title: `Video ${i + 1}`,
        })),
        popularTags: [],
        metadata: {
          version: 1,
          updatedAt: '2024-06-22T12:00:00Z',
          genre: 'all',
          period: '24h',
        },
      };
      const manyVideosHour = {
        items: [],
        popularTags: [],
        metadata: {
          version: 1,
          updatedAt: '2024-06-22T12:00:00Z',
          genre: 'all',
          period: 'hour',
        },
      };

      env.R2_BUCKET._storage.set('rankings/metadata.json', mockRankingMetadata);
      env.R2_BUCKET._storage.set('rankings/all/24h/all.json', manyVideos24h);
      env.R2_BUCKET._storage.set('rankings/all/hour/all.json', manyVideosHour);

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

      await runScheduled();

      // Verify that fetch was called multiple times (batching)
      // 150 videos / 50 per batch = 3 calls
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
