import type { RankingItem } from '@/types/ranking'

export interface FetchPageResult<T> {
  items: T[]
  popularTags?: string[]
}

export interface CollectRankingOptions<T> {
  fetchPage: (page: number) => Promise<FetchPageResult<T>>
  normalizeItems: (items: T[]) => RankingItem[]
  filterItems: (items: RankingItem[]) => Promise<{ filteredItems: RankingItem[]; newDerivedIds: string[] }>
  onDerivedIds?: (ids: string[], page: number) => Promise<void> | void
  onFetchError?: (error: unknown, page: number) => void
  targetCount: number
  maxPages: number
  pageDelayMs?: number
  dedupe?: boolean
  stopOnEmptyPage?: boolean
  stopWhenPageItemsLessThan?: number
  onError?: 'throw' | 'break'
}

export interface CollectRankingResult {
  items: RankingItem[]
  popularTags: string[]
}

const defaultNormalize = (items: RankingItem[]) => items

export async function collectRankingItems<T>(options: CollectRankingOptions<T>): Promise<CollectRankingResult> {
  const {
    fetchPage,
    normalizeItems,
    filterItems,
    onDerivedIds,
    targetCount,
    maxPages,
    pageDelayMs = 0,
    dedupe = true,
    stopOnEmptyPage = false,
    stopWhenPageItemsLessThan,
    onError = 'throw'
  } = options

  const allItems: RankingItem[] = []
  const seenVideoIds = dedupe ? new Set<string>() : null
  let popularTags: string[] = []

  let page = 1
  while (allItems.length < targetCount && page <= maxPages) {
    let pageResult: FetchPageResult<T>
    try {
      pageResult = await fetchPage(page)
    } catch (error) {
      if (options.onFetchError) {
        options.onFetchError(error, page)
      }
      if (onError === 'break') {
        break
      }
      throw error
    }

    const pageItems = Array.isArray(pageResult.items) ? pageResult.items : []

    if (page === 1 && Array.isArray(pageResult.popularTags)) {
      popularTags = pageResult.popularTags
    }

    if (stopOnEmptyPage && pageItems.length === 0) {
      break
    }

    const normalized = (normalizeItems || defaultNormalize)(pageItems)
    const { filteredItems, newDerivedIds } = await filterItems(normalized)

    if (newDerivedIds.length > 0 && onDerivedIds) {
      await onDerivedIds(newDerivedIds, page)
    }

    if (dedupe && seenVideoIds) {
      for (const item of filteredItems) {
        if (!seenVideoIds.has(item.id)) {
          seenVideoIds.add(item.id)
          allItems.push(item)
        }
      }
    } else {
      allItems.push(...filteredItems)
    }

    if (stopWhenPageItemsLessThan && pageItems.length < stopWhenPageItemsLessThan) {
      break
    }

    page += 1

    if (pageDelayMs > 0 && page <= maxPages && allItems.length < targetCount) {
      await new Promise(resolve => setTimeout(resolve, pageDelayMs))
    }
  }

  const limitedItems = allItems.slice(0, targetCount).map((item, index) => ({
    ...item,
    rank: index + 1
  }))

  return {
    items: limitedItems,
    popularTags
  }
}
