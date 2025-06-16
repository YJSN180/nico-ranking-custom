import type { NGList } from '@/types/ng-list'

// 古い形式のNGList型定義
interface LegacyNGList {
  videoIds: string[]
  videoTitles: string[]
  authorIds: string[]
  authorNames: string[]
  derivedVideoIds?: string[]
}

/**
 * 古い形式のNGListを新しい形式に変換
 */
export function migrateLegacyNGList(data: any): NGList {
  // null/undefinedの場合はデフォルト値を返す
  if (!data) {
    return createEmptyNGList()
  }

  // すでに新しい形式の場合はそのまま返す
  if (isNewFormatNGList(data)) {
    return data
  }

  // 古い形式から新しい形式に変換
  return {
    videoIds: Array.isArray(data.videoIds) ? data.videoIds : [],
    videoTitles: {
      exact: Array.isArray(data.videoTitles) ? data.videoTitles : [],
      partial: []  // 古い形式には部分一致がないので空配列
    },
    authorIds: Array.isArray(data.authorIds) ? data.authorIds : [],
    authorNames: {
      exact: Array.isArray(data.authorNames) ? data.authorNames : [],
      partial: []  // 古い形式には部分一致がないので空配列
    },
    derivedVideoIds: Array.isArray(data.derivedVideoIds) ? data.derivedVideoIds : undefined
  }
}

/**
 * 新しい形式のNGListかどうかを判定
 */
export function isNewFormatNGList(data: any): data is NGList {
  if (!data || typeof data !== 'object') {
    return false
  }
  
  return (
    Array.isArray(data.videoIds) &&
    data.videoTitles &&
    typeof data.videoTitles === 'object' &&
    Array.isArray(data.videoTitles.exact) &&
    Array.isArray(data.videoTitles.partial) &&
    Array.isArray(data.authorIds) &&
    data.authorNames &&
    typeof data.authorNames === 'object' &&
    Array.isArray(data.authorNames.exact) &&
    Array.isArray(data.authorNames.partial)
  )
}

/**
 * 空のNGListを作成
 */
export function createEmptyNGList(): NGList {
  return {
    videoIds: [],
    videoTitles: {
      exact: [],
      partial: []
    },
    authorIds: [],
    authorNames: {
      exact: [],
      partial: []
    }
  }
}

/**
 * NGListを保存用の形式に変換（derivedVideoIdsを除外）
 */
export function ngListToSaveFormat(ngList: NGList): Omit<NGList, 'derivedVideoIds'> {
  const { derivedVideoIds, ...saveData } = ngList
  return saveData
}