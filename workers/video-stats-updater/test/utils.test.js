import { describe, it, expect } from 'vitest';
import { 
  extractUniqueVideoIds, 
  parseVideoTags,
  buildSnapshotAPIUrl,
  processSnapshotResponse 
} from '../src/utils';

describe('Utils', () => {
  describe('extractUniqueVideoIds', () => {
    it('should extract unique video IDs from ranking data', () => {
      const rankingData = {
        genres: {
          all: {
            '24h': {
              items: [
                { id: 'sm1', title: 'Video 1' },
                { id: 'sm2', title: 'Video 2' },
              ],
            },
            'hour': {
              items: [
                { id: 'sm2', title: 'Video 2' },
                { id: 'sm3', title: 'Video 3' },
              ],
            },
          },
          anime: {
            '24h': {
              items: [
                { id: 'sm1', title: 'Video 1' },
                { id: 'sm4', title: 'Video 4' },
              ],
            },
            'hour': {
              items: [],
            },
          },
        },
      };

      const videoIds = extractUniqueVideoIds(rankingData);
      expect(videoIds).toEqual(['sm1', 'sm2', 'sm3', 'sm4']);
      expect(videoIds.length).toBe(4);
    });

    it('should handle empty ranking data', () => {
      const rankingData = {
        genres: {
          all: {
            '24h': { items: [] },
            'hour': { items: [] },
          },
        },
      };

      const videoIds = extractUniqueVideoIds(rankingData);
      expect(videoIds).toEqual([]);
    });

    it('should handle missing periods', () => {
      const rankingData = {
        genres: {
          all: {
            '24h': {
              items: [{ id: 'sm1', title: 'Video 1' }],
            },
          },
        },
      };

      const videoIds = extractUniqueVideoIds(rankingData);
      expect(videoIds).toEqual(['sm1']);
    });
  });

  describe('parseVideoTags', () => {
    it('should parse space-separated tags', () => {
      const tags = parseVideoTags('tag1 tag2 tag3');
      expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle empty tags', () => {
      const tags = parseVideoTags('');
      expect(tags).toEqual([]);
    });

    it('should handle null/undefined tags', () => {
      expect(parseVideoTags(null)).toEqual([]);
      expect(parseVideoTags(undefined)).toEqual([]);
    });

    it('should trim whitespace', () => {
      const tags = parseVideoTags('  tag1   tag2  ');
      expect(tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('buildSnapshotAPIUrl', () => {
    it('should build correct API URL for video IDs', () => {
      const videoIds = ['sm1', 'sm2', 'sm3'];
      const url = buildSnapshotAPIUrl(videoIds);
      
      expect(url).toContain('https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search');
      expect(url).toContain('jsonFilter=' + encodeURIComponent('{"type":"or","filters":[{"type":"equal","field":"contentId","value":"sm1"},{"type":"equal","field":"contentId","value":"sm2"},{"type":"equal","field":"contentId","value":"sm3"}]}'));
    });

    it('should handle single video ID', () => {
      const url = buildSnapshotAPIUrl(['sm1']);
      // URLエンコードされた値を確認
      expect(decodeURIComponent(url)).toContain('"value":"sm1"');
    });

    it('should handle empty array', () => {
      const url = buildSnapshotAPIUrl([]);
      // URLエンコードされた値を確認
      expect(decodeURIComponent(url)).toContain('"filters":[]');
    });
  });

  describe('processSnapshotResponse', () => {
    it('should process snapshot API response correctly', () => {
      const response = {
        data: [
          {
            contentId: 'sm1',
            viewCounter: 1000,
            commentCounter: 50,
            mylistCounter: 20,
            likeCounter: 100,
            tags: 'tag1 tag2',
          },
          {
            contentId: 'sm2',
            viewCounter: 2000,
            commentCounter: 100,
            mylistCounter: 40,
            likeCounter: 200,
            tags: 'tag3 tag4',
          },
        ],
      };

      const stats = processSnapshotResponse(response);
      
      expect(stats).toEqual({
        sm1: {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 20,
          likeCounter: 100,
          tags: ['tag1', 'tag2'],
        },
        sm2: {
          viewCounter: 2000,
          commentCounter: 100,
          mylistCounter: 40,
          likeCounter: 200,
          tags: ['tag3', 'tag4'],
        },
      });
    });

    it('should handle missing fields with defaults', () => {
      const response = {
        data: [
          {
            contentId: 'sm1',
            // Missing some fields
          },
        ],
      };

      const stats = processSnapshotResponse(response);
      
      expect(stats.sm1).toEqual({
        viewCounter: 0,
        commentCounter: 0,
        mylistCounter: 0,
        likeCounter: 0,
        tags: [],
      });
    });

    it('should handle empty response', () => {
      const response = { data: [] };
      const stats = processSnapshotResponse(response);
      expect(stats).toEqual({});
    });
  });
});