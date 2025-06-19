import type { NGList } from '@/types/ng-list'

/**
 * レガシーNGリスト形式から新しい形式への移行
 */
interface LegacyNGList {
  videoIds: string[]
  videoTitles: string[]
  authorIds: string[]
  authorNames: string[]
  derivedVideoIds?: string[]
}

export function migrateLegacyNGList(legacyData: any): NGList {
  // null/undefinedの場合は空のNGListを返す
  if (!legacyData) {
    return {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: []
    }
  }

  // 既に新しい形式の場合はそのまま返す
  if (legacyData?.videoTitles?.exact && legacyData?.authorNames?.exact) {
    return legacyData as NGList
  }

  // レガシー形式から新しい形式に変換
  const legacy = legacyData as LegacyNGList
  
  return {
    videoIds: legacy.videoIds || [],
    videoTitles: {
      exact: legacy.videoTitles || [],
      partial: []
    },
    authorIds: legacy.authorIds || [],
    authorNames: {
      exact: legacy.authorNames || [],
      partial: []
    },
    derivedVideoIds: legacy.derivedVideoIds || []
  }
}

/**
 * NGリストの形式を検証
 */
export function isLegacyFormat(data: any): boolean {
  return data && 
         Array.isArray(data.videoTitles) && 
         Array.isArray(data.authorNames) &&
         !data.videoTitles.exact &&
         !data.authorNames.exact
}

/**
 * 空のNGListを作成
 */
export function createEmptyNGList(): NGList {
  return {
    videoIds: [],
    videoTitles: { exact: [], partial: [] },
    authorIds: [],
    authorNames: { exact: [], partial: [] },
    derivedVideoIds: []
  }
}

/**
 * NGリストの統計情報を取得
 */
export function getNGListStats(ngList: NGList): {
  manualVideoIds: number
  manualVideoTitles: number
  manualAuthorIds: number
  manualAuthorNames: number
  derivedVideoIds: number
} {
  return {
    manualVideoIds: ngList.videoIds.length,
    manualVideoTitles: ngList.videoTitles.exact.length + ngList.videoTitles.partial.length,
    manualAuthorIds: ngList.authorIds.length,
    manualAuthorNames: ngList.authorNames.exact.length + ngList.authorNames.partial.length,
    derivedVideoIds: ngList.derivedVideoIds?.length || 0
  }
}