import { describe, it, expect, vi } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import { collectRankingItems } from '@/lib/pipeline/collect-ranking-items'

const createItem = (id: string): RankingItem => ({
  rank: 0,
  id,
  title: `title-${id}`,
  thumbURL: '',
  views: 0,
  comments: 0,
  mylists: 0,
  likes: 0,
  tags: [],
  authorId: 'author',
  authorName: 'author',
  authorIcon: '',
  registeredAt: '',
  duration: 0,
})

describe('collectRankingItems', () => {
  it('dedupes and reassigns ranks', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 1) {
        return { items: [createItem('a'), createItem('b')], popularTags: ['tag1'] }
      }
      return { items: [createItem('b'), createItem('c')] }
    })

    const result = await collectRankingItems({
      fetchPage,
      normalizeItems: (items) => items,
      filterItems: async (items) => ({ filteredItems: items, newDerivedIds: [] }),
      targetCount: 3,
      maxPages: 2,
      dedupe: true,
    })

    expect(result.items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.items.map((item) => item.rank)).toEqual([1, 2, 3])
    expect(result.popularTags).toEqual(['tag1'])
  })

  it('invokes onDerivedIds with page index', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: [createItem(page === 1 ? 'a' : 'b')],
    }))

    const onDerivedIds = vi.fn()

    await collectRankingItems({
      fetchPage,
      normalizeItems: (items) => items,
      filterItems: async (items) => ({
        filteredItems: items,
        newDerivedIds: items[0]?.id === 'b' ? ['x'] : [],
      }),
      onDerivedIds,
      targetCount: 2,
      maxPages: 2,
      dedupe: false,
    })

    expect(onDerivedIds).toHaveBeenCalledWith(['x'], 2)
  })

  it('breaks on fetch error when onError is break', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 2) {
        throw new Error('404')
      }
      return { items: [createItem('a')] }
    })

    const onFetchError = vi.fn()

    const result = await collectRankingItems({
      fetchPage,
      normalizeItems: (items) => items,
      filterItems: async (items) => ({ filteredItems: items, newDerivedIds: [] }),
      onFetchError,
      targetCount: 3,
      maxPages: 3,
      onError: 'break',
    })

    expect(result.items.map((item) => item.id)).toEqual(['a'])
    expect(onFetchError).toHaveBeenCalledTimes(1)
  })
})
