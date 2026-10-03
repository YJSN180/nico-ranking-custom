import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyCustomFilters, collectTagCounts } from '@/lib/custom-ranking-filter'
import type { RankingItem } from '@/types/ranking'
import type { TagCondition } from '@/types/custom-ranking'

// Suppress console logs during tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

// Test data factory
function createRankingItem(
  overrides: Partial<RankingItem> = {}
): RankingItem {
  return {
    rank: 1,
    videoId: 'sm12345',
    title: 'Test Video',
    thumbUrl: 'https://example.com/thumb.jpg',
    views: 1000,
    likes: 100,
    comments: 50,
    mylists: 25,
    postedAt: '2024-01-01',
    duration: '10:00',
    tags: [],
    authorId: 'user123',
    authorName: 'Test User',
    authorIcon: 'https://example.com/icon.jpg',
    ...overrides
  }
}

describe('custom-ranking-filter', () => {
  describe('applyCustomFilters', () => {
    it('should return all items when no conditions provided', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: ['VOCALOID'] }),
        createRankingItem({ videoId: 'sm2', tags: ['ゲーム'] })
      ]

      const result = applyCustomFilters(items, [])
      expect(result).toHaveLength(2)
    })

    it('should filter items by AND condition (must have tag)', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: ['VOCALOID', '初音ミク'] }),
        createRankingItem({ videoId: 'sm2', tags: ['VOCALOID'] }),
        createRankingItem({ videoId: 'sm3', tags: ['ゲーム'] })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2)
      expect(result.map(i => i.videoId)).toContain('sm1')
      expect(result.map(i => i.videoId)).toContain('sm2')
    })

    it('should filter items by multiple AND conditions (all must match)', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: ['VOCALOID', '初音ミク'] }),
        createRankingItem({ videoId: 'sm2', tags: ['VOCALOID'] }),
        createRankingItem({ videoId: 'sm3', tags: ['初音ミク'] })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'both' },
        { tag: '初音ミク', operator: 'AND', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1)
      expect(result[0].videoId).toBe('sm1')
    })

    it('should filter items by OR condition (any match)', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: ['VOCALOID'] }),
        createRankingItem({ videoId: 'sm2', tags: ['VOICEROID'] }),
        createRankingItem({ videoId: 'sm3', tags: ['ゲーム'] })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'OR', tagType: 'both' },
        { tag: 'VOICEROID', operator: 'OR', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2)
      expect(result.map(i => i.videoId)).toContain('sm1')
      expect(result.map(i => i.videoId)).toContain('sm2')
    })

    it('should filter items by NOT condition (exclude tag)', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: ['VOCALOID'] }),
        createRankingItem({ videoId: 'sm2', tags: ['VOCALOID', 'MMD'] }),
        createRankingItem({ videoId: 'sm3', tags: ['ゲーム'] })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'both' },
        { tag: 'MMD', operator: 'NOT', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1)
      expect(result[0].videoId).toBe('sm1')
    })

    it('should be case-insensitive when matching tags', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: ['VOCALOID'] }),
        createRankingItem({ videoId: 'sm2', tags: ['vocaloid'] }),
        createRankingItem({ videoId: 'sm3', tags: ['Vocaloid'] })
      ]

      const conditions: TagCondition[] = [
        { tag: 'vocaloid', operator: 'AND', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(3)
    })

    it('should use tagDetails when available', () => {
      const items = [
        createRankingItem({
          videoId: 'sm1',
          tags: [],
          tagDetails: [
            { name: 'VOCALOID', isLocked: true },
            { name: '初音ミク', isLocked: false }
          ]
        }),
        createRankingItem({
          videoId: 'sm2',
          tags: ['ゲーム']
        })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1)
      expect(result[0].videoId).toBe('sm1')
    })

    it('should filter by locked tags only when tagType is "lock"', () => {
      const items = [
        createRankingItem({
          videoId: 'sm1',
          tagDetails: [
            { name: 'VOCALOID', isLocked: true }
          ]
        }),
        createRankingItem({
          videoId: 'sm2',
          tagDetails: [
            { name: 'VOCALOID', isLocked: false }
          ]
        })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'lock' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1)
      expect(result[0].videoId).toBe('sm1')
    })

    it('should filter by user tags only when tagType is "user"', () => {
      const items = [
        createRankingItem({
          videoId: 'sm1',
          tagDetails: [
            { name: 'VOCALOID', isLocked: true }
          ]
        }),
        createRankingItem({
          videoId: 'sm2',
          tagDetails: [
            { name: 'VOCALOID', isLocked: false }
          ]
        })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'user' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1)
      expect(result[0].videoId).toBe('sm2')
    })

    it('should return items matching NOT conditions only', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: ['VOCALOID'] }),
        createRankingItem({ videoId: 'sm2', tags: ['ゲーム'] }),
        createRankingItem({ videoId: 'sm3', tags: ['アニメ'] })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'NOT', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2)
      expect(result.map(i => i.videoId)).not.toContain('sm1')
    })

    it('should handle empty items array', () => {
      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'both' }
      ]

      const result = applyCustomFilters([], conditions)
      expect(result).toHaveLength(0)
    })

    it('should handle items without tags', () => {
      const items = [
        createRankingItem({ videoId: 'sm1', tags: undefined }),
        createRankingItem({ videoId: 'sm2', tags: [] })
      ]

      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'AND', tagType: 'both' }
      ]

      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(0)
    })
  })

  // 修正前は候補から DAM&amp;JOY配信中 の形で条件を保存できた。保存値は書き換えず、比べるときに合わせる
  describe('applyCustomFilters with escaped tag names', () => {
    it('matches a saved escaped condition against decoded video tags', () => {
      const items = [
        createRankingItem({
          id: 'sm1',
          tagDetails: [{ name: 'DAM&JOY配信中', isLocked: true }],
        }),
        createRankingItem({ id: 'sm2', tags: ['DAM&JOY配信中'] }),
        createRankingItem({
          id: 'sm3',
          tagDetails: [{ name: 'カラオケ', isLocked: true }],
        }),
      ]
      const conditions: TagCondition[] = [
        { tag: 'DAM&amp;JOY配信中', operator: 'AND', tagType: 'both' },
      ]

      const result = applyCustomFilters(items, conditions)

      expect(result.map((item) => item.id)).toEqual(['sm1', 'sm2'])
    })

    it('matches a decoded condition against escaped tags from an older ranking generation', () => {
      const items = [
        createRankingItem({
          id: 'sm1',
          tagDetails: [{ name: 'DAM&amp;JOY配信中', isLocked: false }],
        }),
        createRankingItem({
          id: 'sm2',
          tagDetails: [{ name: 'カラオケ', isLocked: false }],
        }),
      ]
      const conditions: TagCondition[] = [
        { tag: 'dam&joy配信中', operator: 'OR', tagType: 'user' },
      ]

      expect(
        applyCustomFilters(items, conditions).map((item) => item.id),
      ).toEqual(['sm1'])
    })

    it('applies escaped NOT conditions and still checks the tag type', () => {
      const items = [
        createRankingItem({
          id: 'sm1',
          tagDetails: [
            { name: 'ゲーム', isLocked: true },
            { name: 'R&B', isLocked: false },
          ],
        }),
        createRankingItem({
          id: 'sm2',
          tagDetails: [{ name: 'ゲーム', isLocked: true }],
        }),
      ]
      const notEscaped: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'both' },
        { tag: 'R&amp;B', operator: 'NOT', tagType: 'both' },
      ]
      const lockOnly: TagCondition[] = [
        { tag: 'R&amp;B', operator: 'AND', tagType: 'lock' },
      ]

      expect(
        applyCustomFilters(items, notEscaped).map((item) => item.id),
      ).toEqual(['sm2'])
      expect(applyCustomFilters(items, lockOnly)).toHaveLength(0)
    })

    it('keeps plain names and real names containing & matchable', () => {
      const items = [
        createRankingItem({
          id: 'sm1',
          tagDetails: [{ name: 'Tom&Jerry', isLocked: false }],
        }),
        createRankingItem({
          id: 'sm2',
          tagDetails: [{ name: 'chage&amp;aska', isLocked: false }],
        }),
        createRankingItem({
          id: 'sm3',
          tagDetails: [{ name: 'VOCALOID', isLocked: true }],
        }),
      ]

      const byTag = (tag: string): string[] =>
        applyCustomFilters(items, [
          { tag, operator: 'AND', tagType: 'both' },
        ]).map((item) => item.id)

      expect(byTag('tom&jerry')).toEqual(['sm1'])
      expect(byTag('vocaloid')).toEqual(['sm3'])
      // 本当の名前が chage&amp;aska のタグ。そのままでも、修正前の XML のままの保存値でも当たる
      expect(byTag('chage&amp;aska')).toEqual(['sm2'])
      expect(byTag('chage&amp;amp;aska')).toEqual(['sm2'])
    })
  })

  describe('collectTagCounts', () => {
    it('should count tags from items', () => {
      const items = [
        createRankingItem({ tags: ['VOCALOID', '初音ミク'] }),
        createRankingItem({ tags: ['VOCALOID'] }),
        createRankingItem({ tags: ['ゲーム'] })
      ]

      const counts = collectTagCounts(items)

      expect(counts.get('VOCALOID')).toBe(2)
      expect(counts.get('初音ミク')).toBe(1)
      expect(counts.get('ゲーム')).toBe(1)
    })

    it('should count tags from tagDetails when available', () => {
      const items = [
        createRankingItem({
          tagDetails: [
            { name: 'VOCALOID', isLocked: true },
            { name: '初音ミク', isLocked: false }
          ]
        }),
        createRankingItem({
          tagDetails: [
            { name: 'VOCALOID', isLocked: false }
          ]
        })
      ]

      const counts = collectTagCounts(items)

      expect(counts.get('VOCALOID')).toBe(2)
      expect(counts.get('初音ミク')).toBe(1)
    })

    it('should return empty map for empty items', () => {
      const counts = collectTagCounts([])
      expect(counts.size).toBe(0)
    })

    it('should return empty map for items without tags', () => {
      const items = [
        createRankingItem({ tags: [] }),
        createRankingItem({ tags: undefined })
      ]

      const counts = collectTagCounts(items)
      expect(counts.size).toBe(0)
    })

    it('should prefer tagDetails over tags', () => {
      const items = [
        createRankingItem({
          tags: ['Old Tag'],
          tagDetails: [
            { name: 'New Tag', isLocked: true }
          ]
        })
      ]

      const counts = collectTagCounts(items)

      expect(counts.get('New Tag')).toBe(1)
      expect(counts.has('Old Tag')).toBe(false)
    })
  })
})
