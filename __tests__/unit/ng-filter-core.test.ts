import { describe, it, expect } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'
import type { ExtendedNGList, TagNGList } from '@/types/ng-list-extended'
import { filterWithNGListCore } from '@/lib/ng-filter-core'

const makeItem = (overrides: Partial<RankingItem>): RankingItem => ({
  rank: 1,
  id: 'sm1',
  title: 'title',
  thumbURL: '',
  views: 0,
  ...overrides
})

const baseNgList: NGList = {
  videoIds: [],
  videoTitles: { exact: [], partial: [] },
  authorIds: [],
  authorNames: { exact: [], partial: [] },
  derivedVideoIds: []
}

const legacyBaseFilter = (
  items: RankingItem[],
  ngList: NGList
) => {
  const newDerivedIds: string[] = []
  if (!items || !Array.isArray(items)) {
    return { filteredItems: [], newDerivedIds }
  }
  const itemsWithResetRank = items.map((item, index) => ({
    ...item,
    rank: index + 1
  }))
  const videoIdSet = new Set(ngList.videoIds)
  const derivedVideoIdSet = new Set(ngList.derivedVideoIds || [])
  const videoTitleExactSet = new Set(ngList.videoTitles.exact)
  const authorIdSet = new Set(ngList.authorIds)
  const authorNameExactSet = new Set(ngList.authorNames.exact)

  const filteredItems = itemsWithResetRank.filter(item => {
    if (videoIdSet.has(item.id)) return false
    if (derivedVideoIdSet.has(item.id)) return false
    if (videoTitleExactSet.has(item.title)) {
      newDerivedIds.push(item.id)
      return false
    }
    if (ngList.videoTitles.partial.some(partial => item.title.includes(partial))) {
      newDerivedIds.push(item.id)
      return false
    }
    if (item.authorId && authorIdSet.has(item.authorId)) {
      newDerivedIds.push(item.id)
      return false
    }
    if (item.authorName && authorNameExactSet.has(item.authorName)) {
      newDerivedIds.push(item.id)
      return false
    }
    if (item.authorName && ngList.authorNames.partial.some(partial => item.authorName!.includes(partial))) {
      newDerivedIds.push(item.id)
      return false
    }
    return true
  })

  const rerankedItems = filteredItems.map((item, index) => ({
    ...item,
    rank: index + 1
  }))

  return { filteredItems: rerankedItems, newDerivedIds }
}

const legacyExtendedFilter = (
  items: RankingItem[],
  ngList: ExtendedNGList,
  tagFilter: (item: RankingItem) => boolean
) => {
  const base = legacyBaseFilter(items, ngList)
  const newDerivedIds = [...base.newDerivedIds]
  const filteredItems = base.filteredItems.filter(item => {
    if (tagFilter(item)) {
      newDerivedIds.push(item.id)
      return false
    }
    return true
  })
  const rerankedItems = filteredItems.map((item, index) => ({
    ...item,
    rank: index + 1
  }))
  return { filteredItems: rerankedItems, newDerivedIds }
}

const createRng = (seed: number) => {
  let value = seed
  return () => {
    value = (value * 48271) % 2147483647
    return value / 2147483647
  }
}

const randomString = (rng: () => number, prefix: string) => `${prefix}${Math.floor(rng() * 1000)}`

const buildRandomList = (rng: () => number): NGList => {
  return {
    videoIds: [randomString(rng, 'sm')],
    videoTitles: {
      exact: [randomString(rng, 'title-')],
      partial: ['part']
    },
    authorIds: [randomString(rng, 'au')],
    authorNames: {
      exact: [randomString(rng, 'name-')],
      partial: ['sub']
    },
    derivedVideoIds: [randomString(rng, 'sm')]
  }
}

describe('filterWithNGListCore', () => {
  it('filters by id/title/author and returns derived ids', () => {
    const ngList: NGList = {
      ...baseNgList,
      videoIds: ['sm1'],
      videoTitles: { exact: ['block-title'], partial: ['partial'] },
      authorIds: ['auth1'],
      authorNames: { exact: ['author-exact'], partial: ['author-part'] },
      derivedVideoIds: ['sm-derived']
    }

    const items = [
      makeItem({ id: 'sm1', title: 'ok', authorId: 'x', authorName: 'y' }),
      makeItem({ id: 'sm2', title: 'block-title', authorId: 'x', authorName: 'y' }),
      makeItem({ id: 'sm3', title: 'has partial', authorId: 'x', authorName: 'y' }),
      makeItem({ id: 'sm4', title: 'ok', authorId: 'auth1', authorName: 'y' }),
      makeItem({ id: 'sm5', title: 'ok', authorId: 'x', authorName: 'author-exact' }),
      makeItem({ id: 'sm6', title: 'ok', authorId: 'x', authorName: 'author-partial' }),
      makeItem({ id: 'sm-derived', title: 'ok', authorId: 'x', authorName: 'y' }),
      makeItem({ id: 'sm7', title: 'safe', authorId: 'x', authorName: 'y' })
    ]

    const result = filterWithNGListCore(items, ngList)

    expect(result.filteredItems.map(item => item.id)).toEqual(['sm7'])
    expect(result.newDerivedIds).toEqual(['sm2', 'sm3', 'sm4', 'sm5', 'sm6'])
    expect(result.filteredItems[0].rank).toBe(1)
  })

  it('applies optional tag filter', () => {
    const tagFilter = (item: RankingItem) => item.tags?.includes('ng-tag') ?? false
    const items = [
      makeItem({ id: 'sm1', title: 'safe', tags: ['ng-tag'] }),
      makeItem({ id: 'sm2', title: 'safe', tags: ['ok'] })
    ]

    const result = filterWithNGListCore(items, baseNgList, { tagFilter })

    expect(result.filteredItems.map(item => item.id)).toEqual(['sm2'])
    expect(result.newDerivedIds).toEqual(['sm1'])
  })

  it('matches legacy behavior for randomized inputs (base)', () => {
    const rng = createRng(12345)

    for (let i = 0; i < 20; i += 1) {
      const ngList = buildRandomList(rng)
      const items: RankingItem[] = Array.from({ length: 15 }, (_, index) => {
        const id = index % 3 === 0 ? ngList.videoIds[0] : randomString(rng, 'sm')
        const title = index % 4 === 0 ? ngList.videoTitles.exact[0] : `title-${randomString(rng, '')}`
        const authorId = index % 5 === 0 ? ngList.authorIds[0] : randomString(rng, 'au')
        const authorName = index % 6 === 0 ? ngList.authorNames.exact[0] : `name-${randomString(rng, '')}`
        return makeItem({ id, title, authorId, authorName, rank: index + 1 })
      })

      const baseline = legacyBaseFilter(items, ngList)
      const core = filterWithNGListCore(items, ngList)

      expect(core.filteredItems.map(item => item.id)).toEqual(baseline.filteredItems.map(item => item.id))
      expect(core.newDerivedIds).toEqual(baseline.newDerivedIds)
    }
  })

  it('matches legacy behavior for randomized inputs (extended tags)', () => {
    const rng = createRng(6789)
    const tagFilter = (item: RankingItem) => item.tags?.includes('ng-tag') ?? false
    const tagList: TagNGList = {
      locked: { exact: [], partial: [] },
      user: { exact: [], partial: [] },
      both: { exact: [], partial: [] }
    }

    for (let i = 0; i < 20; i += 1) {
      const baseList = buildRandomList(rng)
      const ngList: ExtendedNGList = {
        ...baseList,
        tags: tagList
      }

      const items: RankingItem[] = Array.from({ length: 12 }, (_, index) => {
        const tags = index % 2 === 0 ? ['ng-tag'] : ['ok']
        return makeItem({
          id: randomString(rng, 'sm'),
          title: `title-${randomString(rng, '')}`,
          authorId: randomString(rng, 'au'),
          authorName: `name-${randomString(rng, '')}`,
          tags,
          rank: index + 1
        })
      })

      const baseline = legacyExtendedFilter(items, ngList, tagFilter)
      const core = filterWithNGListCore(items, ngList, { tagFilter })

      expect(core.filteredItems.map(item => item.id)).toEqual(baseline.filteredItems.map(item => item.id))
      expect(core.newDerivedIds).toEqual(baseline.newDerivedIds)
    }
  })
})
