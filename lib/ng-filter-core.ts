import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'

export interface NGFilterCoreOptions {
  tagFilter?: (item: RankingItem) => boolean
}

export interface NGFilterCoreResult {
  filteredItems: RankingItem[]
  newDerivedIds: string[]
}

/**
 * 投稿者名 NG（完全一致・部分一致）に当たるか。下の filterWithNGListCore と同じ規則で、
 * 検索で後から名前が分かった投稿者（/api/search/owners）に使う
 */
export function matchesAuthorNameNG(name: string, authorNames: NGList['authorNames']): boolean {
  if (!name) return false
  return authorNames.exact.includes(name) || authorNames.partial.some((partial) => name.includes(partial))
}

export function filterWithNGListCore(
  items: RankingItem[],
  ngList: NGList,
  options: NGFilterCoreOptions = {}
): NGFilterCoreResult {
  const newDerivedIds: string[] = []

  if (!items || !Array.isArray(items)) {
    return {
      filteredItems: [],
      newDerivedIds
    }
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
  // 粗悪コンテンツ自動NG（許可リスト適用済み）。手動リストの後に評価し、派生NGには積まない
  const autoAuthorIdSet = new Set(ngList.autoAuthorIds ?? [])
  const autoVideoIdSet = new Set(ngList.autoVideoIds ?? [])

  const filteredItems = itemsWithResetRank.filter(item => {
    if (videoIdSet.has(item.id)) {
      return false
    }

    if (derivedVideoIdSet.has(item.id)) {
      return false
    }

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

    if (options.tagFilter && options.tagFilter(item)) {
      newDerivedIds.push(item.id)
      return false
    }

    if (autoVideoIdSet.has(item.id)) {
      return false
    }

    if (item.authorId && autoAuthorIdSet.has(item.authorId)) {
      return false
    }

    return true
  })

  const rerankedItems = filteredItems.map((item, index) => ({
    ...item,
    rank: index + 1
  }))

  return {
    filteredItems: rerankedItems,
    newDerivedIds
  }
}
