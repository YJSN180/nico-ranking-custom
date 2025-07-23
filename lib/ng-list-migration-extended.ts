import type { NGList } from '@/types/ng-list'
import type { ExtendedNGList, ExtendedUserNGList, TagNGList } from '@/types/ng-list-extended'

/**
 * オブジェクトがExtendedNGListかどうかを判定
 */
export function isExtendedNGList(obj: any): obj is ExtendedNGList {
  if (!obj || typeof obj !== 'object') {
    return false
  }
  
  // 既存のNGListプロパティをチェック
  if (!('videoIds' in obj) || !Array.isArray(obj.videoIds)) {
    return false
  }
  if (!('videoTitles' in obj) || !obj.videoTitles || 
      !Array.isArray(obj.videoTitles.exact) || !Array.isArray(obj.videoTitles.partial)) {
    return false
  }
  if (!('authorIds' in obj) || !Array.isArray(obj.authorIds)) {
    return false
  }
  if (!('authorNames' in obj) || !obj.authorNames || 
      !Array.isArray(obj.authorNames.exact) || !Array.isArray(obj.authorNames.partial)) {
    return false
  }
  
  // tagsプロパティがある場合は拡張版
  return 'tags' in obj
}

/**
 * 空のタグNGListを作成
 */
export function createEmptyTagNGList(): TagNGList {
  return {
    locked: { exact: [], partial: [] },
    user: { exact: [], partial: [] },
    both: { exact: [], partial: [] }
  }
}

/**
 * NGListをExtendedNGListに移行
 */
export function migrateToExtendedNGList(ngList: NGList): ExtendedNGList {
  // すでに拡張版の場合はそのまま返す
  if (isExtendedNGList(ngList)) {
    return ngList
  }
  
  // 拡張版に変換
  return {
    ...ngList,
    tags: createEmptyTagNGList()
  }
}

/**
 * UserNGListをExtendedUserNGListに移行
 */
export function migrateToExtendedUserNGList(userNGList: any): ExtendedUserNGList {
  // すでにバージョン2（拡張版）の場合はそのまま返す
  if (userNGList.version === 2 && isExtendedNGList(userNGList)) {
    return userNGList as ExtendedUserNGList
  }
  
  // バージョン1から2への移行
  const extendedNGList = migrateToExtendedNGList(userNGList)
  
  return {
    ...extendedNGList,
    version: 2,
    totalCount: userNGList.totalCount || 0,
    updatedAt: new Date().toISOString()
  }
}

/**
 * タグを含めた全アイテム数を計算
 */
export function calculateTotalCountWithTags(ngList: ExtendedNGList): number {
  let count = 0
  
  // 既存のカウント
  count += ngList.videoIds.length
  count += ngList.videoTitles.exact.length
  count += ngList.videoTitles.partial.length
  count += ngList.authorIds.length
  count += ngList.authorNames.exact.length
  count += ngList.authorNames.partial.length
  
  // タグのカウント
  if (ngList.tags) {
    count += ngList.tags.locked.exact.length
    count += ngList.tags.locked.partial.length
    count += ngList.tags.user.exact.length
    count += ngList.tags.user.partial.length
    count += ngList.tags.both.exact.length
    count += ngList.tags.both.partial.length
  }
  
  return count
}