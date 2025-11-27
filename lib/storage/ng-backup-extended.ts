/**
 * 拡張NGリストデータのバックアップ・リストア機能
 * 
 * ⚠️ 重要: 後方互換性を維持するため、既存のバックアップ形式は変更しないこと
 * version "1.0.0" → "1.1.0" への拡張版
 * 既存フィールドの削除・型変更は絶対に行わないでください。
 */

import type { ExtendedUserNGList } from '../../types/ng-list-extended'

// ExtendedNGListBackupDataの型定義をローカルでも宣言してエクスポート
export type ExtendedNGListBackupData = {
  version: string
  exportDate: string
  exportSource: 'settings-applied'
  ngList: ExtendedUserNGList
  metadata: {
    totalItems: number
    categoryBreakdown: {
      videoIds: number
      videoTitlesExact: number
      videoTitlesPartial: number
      authorIds: number
      authorNamesExact: number
      authorNamesPartial: number
      tagsLockedExact?: number
      tagsLockedPartial?: number
      tagsUserExact?: number
      tagsUserPartial?: number
      tagsBothExact?: number
      tagsBothPartial?: number
    }
    appVersion: string
  }
}
import { migrateToExtendedNGList, createEmptyTagNGList } from '../ng-list-migration-extended'

/**
 * 拡張版の重複検出結果
 */
export interface ExtendedConflictDetectionResult {
  hasConflicts: boolean
  conflicts: {
    videoIds: string[]
    videoTitles: {
      exact: string[]
      partial: string[]
    }
    authorIds: string[]
    authorNames: {
      exact: string[]
      partial: string[]
    }
    // タグ関連の重複
    tags?: {
      locked: {
        exact: string[]
        partial: string[]
      }
      user: {
        exact: string[]
        partial: string[]
      }
      both: {
        exact: string[]
        partial: string[]
      }
    }
  }
  inclusions: {
    videoTitles: Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
    authorNames: Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
    // タグ関連の包含関係
    tags?: {
      locked: Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
      user: Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
      both: Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
    }
  }
}

/**
 * 拡張版のインポート結果
 */
export interface ExtendedNGListImportResult {
  success: boolean
  imported: {
    totalItems: number
    categoryBreakdown: {
      videoIds: number
      videoTitlesExact: number
      videoTitlesPartial: number
      authorIds: number
      authorNamesExact: number
      authorNamesPartial: number
      // タグ関連の統計（オプショナル）
      tagsLockedExact?: number
      tagsLockedPartial?: number
      tagsUserExact?: number
      tagsUserPartial?: number
      tagsBothExact?: number
      tagsBothPartial?: number
    }
  }
  skipped: {
    totalItems: number
    reason: string[]
  }
  errors: string[]
  overwritten: boolean
}

/**
 * 拡張版NGリストデータをエクスポート
 */
export function exportExtendedNGListData(): ExtendedNGListBackupData {
  // localStorageから適用済みのNGリストを取得
  const STORAGE_KEY = 'user-ng-list'
  let ngList: ExtendedUserNGList
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      throw new Error('NGリストデータが見つかりません')
    }
    
    const parsed = JSON.parse(stored)
    
    // バージョン1の場合はマイグレーション
    if (parsed.version === 1) {
      ngList = migrateToExtendedNGList(parsed) as ExtendedUserNGList
      ngList.version = 2
    } else {
      ngList = parsed
    }
  } catch (error) {
    throw new Error(`NGリストの読み込みに失敗しました: ${error}`)
  }
  
  // カテゴリ別内訳を計算
  const categoryBreakdown: ExtendedNGListBackupData['metadata']['categoryBreakdown'] = {
    videoIds: ngList.videoIds.length,
    videoTitlesExact: ngList.videoTitles.exact.length,
    videoTitlesPartial: ngList.videoTitles.partial.length,
    authorIds: ngList.authorIds.length,
    authorNamesExact: ngList.authorNames.exact.length,
    authorNamesPartial: ngList.authorNames.partial.length
  }
  
  // タグがある場合は統計を追加
  if (ngList.tags) {
    categoryBreakdown.tagsLockedExact = ngList.tags.locked.exact.length
    categoryBreakdown.tagsLockedPartial = ngList.tags.locked.partial.length
    categoryBreakdown.tagsUserExact = ngList.tags.user.exact.length
    categoryBreakdown.tagsUserPartial = ngList.tags.user.partial.length
    categoryBreakdown.tagsBothExact = ngList.tags.both.exact.length
    categoryBreakdown.tagsBothPartial = ngList.tags.both.partial.length
  }
  
  const totalItems = Object.values(categoryBreakdown).reduce((sum, count) => sum + count, 0)
  
  // バックアップデータを構築
  const backupData: ExtendedNGListBackupData = {
    version: '1.1.0', // 拡張版のバージョン
    exportDate: new Date().toISOString(),
    exportSource: 'settings-applied',
    ngList,
    metadata: {
      totalItems,
      categoryBreakdown,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
    }
  }
  
  return backupData
}

/**
 * 拡張版NGリストバックアップデータの妥当性を検証
 */
export function validateExtendedNGListBackup(data: unknown): data is ExtendedNGListBackupData {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  
  const backup = data as Record<string, unknown>
  
  // 必須フィールドの存在確認
  if (!backup.version || typeof backup.version !== 'string') {
    return false
  }
  
  // バージョン1.0.0と1.1.0の両方を受け入れる
  if (backup.version !== '1.0.0' && backup.version !== '1.1.0') {
    return false
  }
  
  if (!backup.exportDate || typeof backup.exportDate !== 'string') {
    return false
  }
  
  if (backup.exportSource !== 'settings-applied') {
    return false
  }
  
  if (!backup.ngList || typeof backup.ngList !== 'object') {
    return false
  }
  
  if (!backup.metadata || typeof backup.metadata !== 'object') {
    return false
  }
  
  // NGリストの基本構造を検証
  const ngList = backup.ngList as Record<string, unknown>
  
  if (!Array.isArray(ngList.videoIds)) {
    return false
  }
  
  if (!ngList.videoTitles || typeof ngList.videoTitles !== 'object') {
    return false
  }
  
  const videoTitles = ngList.videoTitles as Record<string, unknown>
  if (!Array.isArray(videoTitles.exact) || !Array.isArray(videoTitles.partial)) {
    return false
  }
  
  if (!Array.isArray(ngList.authorIds)) {
    return false
  }
  
  if (!ngList.authorNames || typeof ngList.authorNames !== 'object') {
    return false
  }
  
  const authorNames = ngList.authorNames as Record<string, unknown>
  if (!Array.isArray(authorNames.exact) || !Array.isArray(authorNames.partial)) {
    return false
  }
  
  if (typeof ngList.version !== 'number' || typeof ngList.totalCount !== 'number') {
    return false
  }
  
  if (!ngList.updatedAt || typeof ngList.updatedAt !== 'string') {
    return false
  }
  
  // タグがある場合は検証（オプショナル）
  if (ngList.tags) {
    const tags = ngList.tags as Record<string, unknown>
    
    // locked, user, bothの存在確認
    for (const type of ['locked', 'user', 'both']) {
      if (!tags[type] || typeof tags[type] !== 'object') {
        return false
      }
      
      const tagCategory = tags[type] as Record<string, unknown>
      if (!Array.isArray(tagCategory.exact) || !Array.isArray(tagCategory.partial)) {
        return false
      }
    }
  }
  
  return true
}

/**
 * 拡張版の重複と包含関係を検出
 */
export function detectExtendedConflicts(
  existingNGList: ExtendedUserNGList, 
  importingNGList: ExtendedUserNGList
): ExtendedConflictDetectionResult {
  const conflicts: ExtendedConflictDetectionResult['conflicts'] = {
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
  
  const inclusions: ExtendedConflictDetectionResult['inclusions'] = {
    videoTitles: [],
    authorNames: []
  }
  
  // 基本的な重複検出（既存の処理）
  conflicts.videoIds = importingNGList.videoIds.filter(id => 
    existingNGList.videoIds.includes(id)
  )
  
  conflicts.videoTitles.exact = importingNGList.videoTitles.exact.filter(title =>
    existingNGList.videoTitles.exact.includes(title)
  )
  
  conflicts.videoTitles.partial = importingNGList.videoTitles.partial.filter(title =>
    existingNGList.videoTitles.partial.includes(title)
  )
  
  conflicts.authorIds = importingNGList.authorIds.filter(id =>
    existingNGList.authorIds.includes(id)
  )
  
  conflicts.authorNames.exact = importingNGList.authorNames.exact.filter(name =>
    existingNGList.authorNames.exact.includes(name)
  )
  
  conflicts.authorNames.partial = importingNGList.authorNames.partial.filter(name =>
    existingNGList.authorNames.partial.includes(name)
  )
  
  // 部分一致の包含関係検出（既存の処理）
  for (const existingTitle of existingNGList.videoTitles.partial) {
    for (const importingTitle of importingNGList.videoTitles.partial) {
      if (existingTitle !== importingTitle) {
        if (existingTitle.includes(importingTitle)) {
          inclusions.videoTitles.push({
            existing: existingTitle,
            importing: importingTitle,
            type: 'existing_includes_importing'
          })
        } else if (importingTitle.includes(existingTitle)) {
          inclusions.videoTitles.push({
            existing: existingTitle,
            importing: importingTitle,
            type: 'importing_includes_existing'
          })
        }
      }
    }
  }
  
  for (const existingName of existingNGList.authorNames.partial) {
    for (const importingName of importingNGList.authorNames.partial) {
      if (existingName !== importingName) {
        if (existingName.includes(importingName)) {
          inclusions.authorNames.push({
            existing: existingName,
            importing: importingName,
            type: 'existing_includes_importing'
          })
        } else if (importingName.includes(existingName)) {
          inclusions.authorNames.push({
            existing: existingName,
            importing: importingName,
            type: 'importing_includes_existing'
          })
        }
      }
    }
  }
  
  // タグの重複・包含関係検出
  if (existingNGList.tags && importingNGList.tags) {
    conflicts.tags = {
      locked: {
        exact: importingNGList.tags.locked.exact.filter(tag =>
          existingNGList.tags!.locked.exact.includes(tag)
        ),
        partial: importingNGList.tags.locked.partial.filter(tag =>
          existingNGList.tags!.locked.partial.includes(tag)
        )
      },
      user: {
        exact: importingNGList.tags.user.exact.filter(tag =>
          existingNGList.tags!.user.exact.includes(tag)
        ),
        partial: importingNGList.tags.user.partial.filter(tag =>
          existingNGList.tags!.user.partial.includes(tag)
        )
      },
      both: {
        exact: importingNGList.tags.both.exact.filter(tag =>
          existingNGList.tags!.both.exact.includes(tag)
        ),
        partial: importingNGList.tags.both.partial.filter(tag =>
          existingNGList.tags!.both.partial.includes(tag)
        )
      }
    }
    
    inclusions.tags = {
      locked: [],
      user: [],
      both: []
    }
    
    // タグの包含関係検出
    for (const type of ['locked', 'user', 'both'] as const) {
      for (const existingTag of existingNGList.tags[type].partial) {
        for (const importingTag of importingNGList.tags[type].partial) {
          if (existingTag !== importingTag) {
            if (existingTag.includes(importingTag)) {
              inclusions.tags[type].push({
                existing: existingTag,
                importing: importingTag,
                type: 'existing_includes_importing'
              })
            } else if (importingTag.includes(existingTag)) {
              inclusions.tags[type].push({
                existing: existingTag,
                importing: importingTag,
                type: 'importing_includes_existing'
              })
            }
          }
        }
      }
    }
  }
  
  const hasConflicts = 
    conflicts.videoIds.length > 0 ||
    conflicts.videoTitles.exact.length > 0 ||
    conflicts.videoTitles.partial.length > 0 ||
    conflicts.authorIds.length > 0 ||
    conflicts.authorNames.exact.length > 0 ||
    conflicts.authorNames.partial.length > 0 ||
    inclusions.videoTitles.length > 0 ||
    inclusions.authorNames.length > 0 ||
    (conflicts.tags ? (
      conflicts.tags.locked.exact.length > 0 ||
      conflicts.tags.locked.partial.length > 0 ||
      conflicts.tags.user.exact.length > 0 ||
      conflicts.tags.user.partial.length > 0 ||
      conflicts.tags.both.exact.length > 0 ||
      conflicts.tags.both.partial.length > 0
    ) : false) ||
    (inclusions.tags ? (
      inclusions.tags.locked.length > 0 ||
      inclusions.tags.user.length > 0 ||
      inclusions.tags.both.length > 0
    ) : false)
  
  return {
    hasConflicts,
    conflicts,
    inclusions
  }
}

/**
 * 拡張版NGリストデータをインポート
 */
export function importExtendedNGListData(
  data: ExtendedNGListBackupData,
  conflictResolution: 'overwrite' | 'merge' = 'merge'
): ExtendedNGListImportResult {
  const errors: string[] = []
  let imported: ExtendedNGListImportResult['imported'] = {
    totalItems: 0,
    categoryBreakdown: {
      videoIds: 0,
      videoTitlesExact: 0,
      videoTitlesPartial: 0,
      authorIds: 0,
      authorNamesExact: 0,
      authorNamesPartial: 0
    }
  }
  
  const skipped = {
    totalItems: 0,
    reason: [] as string[]
  }
  
  try {
    // 現在のNGリストを取得
    const STORAGE_KEY = 'user-ng-list'
    let existingNGList: ExtendedUserNGList
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.version === 1) {
          // v1からマイグレーション
          existingNGList = migrateToExtendedNGList(parsed) as ExtendedUserNGList
          existingNGList.version = 2
        } else {
          existingNGList = parsed
        }
      } else {
        // 初期データ
        existingNGList = {
          videoIds: [],
          videoTitles: { exact: [], partial: [] },
          authorIds: [],
          authorNames: { exact: [], partial: [] },
          tags: createEmptyTagNGList(),
          version: 2,
          totalCount: 0,
          updatedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      throw new Error('既存のNGリストデータの読み込みに失敗しました')
    }
    
    // インポートデータもマイグレーション
    let importingNGList = data.ngList
    if (!importingNGList.tags) {
      importingNGList = migrateToExtendedNGList(importingNGList) as ExtendedUserNGList
    }
    
    // 重複検出
    const conflicts = detectExtendedConflicts(existingNGList, importingNGList)
    
    // インポート処理
    const newNGList: ExtendedUserNGList = { ...existingNGList }
    
    if (conflictResolution === 'overwrite') {
      // 上書きモード：インポートデータで完全に置き換え
      newNGList.videoIds = [...importingNGList.videoIds]
      newNGList.videoTitles = {
        exact: [...importingNGList.videoTitles.exact],
        partial: [...importingNGList.videoTitles.partial]
      }
      newNGList.authorIds = [...importingNGList.authorIds]
      newNGList.authorNames = {
        exact: [...importingNGList.authorNames.exact],
        partial: [...importingNGList.authorNames.partial]
      }
      
      if (importingNGList.tags) {
        newNGList.tags = {
          locked: {
            exact: [...importingNGList.tags.locked.exact],
            partial: [...importingNGList.tags.locked.partial]
          },
          user: {
            exact: [...importingNGList.tags.user.exact],
            partial: [...importingNGList.tags.user.partial]
          },
          both: {
            exact: [...importingNGList.tags.both.exact],
            partial: [...importingNGList.tags.both.partial]
          }
        }
      }
      
      imported = {
        totalItems: data.metadata.totalItems,
        categoryBreakdown: { ...data.metadata.categoryBreakdown }
      }
    } else if (conflictResolution === 'merge') {
      // マージモード：重複を除いて結合
      newNGList.videoIds = [...new Set([...existingNGList.videoIds, ...importingNGList.videoIds])]
      newNGList.videoTitles = {
        exact: [...new Set([...existingNGList.videoTitles.exact, ...importingNGList.videoTitles.exact])],
        partial: [...new Set([...existingNGList.videoTitles.partial, ...importingNGList.videoTitles.partial])]
      }
      newNGList.authorIds = [...new Set([...existingNGList.authorIds, ...importingNGList.authorIds])]
      newNGList.authorNames = {
        exact: [...new Set([...existingNGList.authorNames.exact, ...importingNGList.authorNames.exact])],
        partial: [...new Set([...existingNGList.authorNames.partial, ...importingNGList.authorNames.partial])]
      }
      
      // タグのマージ
      if (importingNGList.tags) {
        if (!newNGList.tags) {
          newNGList.tags = createEmptyTagNGList()
        }
        
        newNGList.tags = {
          locked: {
            exact: [...new Set([...existingNGList.tags?.locked.exact || [], ...importingNGList.tags.locked.exact])],
            partial: [...new Set([...existingNGList.tags?.locked.partial || [], ...importingNGList.tags.locked.partial])]
          },
          user: {
            exact: [...new Set([...existingNGList.tags?.user.exact || [], ...importingNGList.tags.user.exact])],
            partial: [...new Set([...existingNGList.tags?.user.partial || [], ...importingNGList.tags.user.partial])]
          },
          both: {
            exact: [...new Set([...existingNGList.tags?.both.exact || [], ...importingNGList.tags.both.exact])],
            partial: [...new Set([...existingNGList.tags?.both.partial || [], ...importingNGList.tags.both.partial])]
          }
        }
      }
      
      // インポートされた新しいアイテム数を計算
      imported.categoryBreakdown.videoIds = newNGList.videoIds.length - existingNGList.videoIds.length
      imported.categoryBreakdown.videoTitlesExact = newNGList.videoTitles.exact.length - existingNGList.videoTitles.exact.length
      imported.categoryBreakdown.videoTitlesPartial = newNGList.videoTitles.partial.length - existingNGList.videoTitles.partial.length
      imported.categoryBreakdown.authorIds = newNGList.authorIds.length - existingNGList.authorIds.length
      imported.categoryBreakdown.authorNamesExact = newNGList.authorNames.exact.length - existingNGList.authorNames.exact.length
      imported.categoryBreakdown.authorNamesPartial = newNGList.authorNames.partial.length - existingNGList.authorNames.partial.length
      
      if (newNGList.tags && existingNGList.tags) {
        imported.categoryBreakdown.tagsLockedExact = newNGList.tags.locked.exact.length - (existingNGList.tags?.locked.exact.length || 0)
        imported.categoryBreakdown.tagsLockedPartial = newNGList.tags.locked.partial.length - (existingNGList.tags?.locked.partial.length || 0)
        imported.categoryBreakdown.tagsUserExact = newNGList.tags.user.exact.length - (existingNGList.tags?.user.exact.length || 0)
        imported.categoryBreakdown.tagsUserPartial = newNGList.tags.user.partial.length - (existingNGList.tags?.user.partial.length || 0)
        imported.categoryBreakdown.tagsBothExact = newNGList.tags.both.exact.length - (existingNGList.tags?.both.exact.length || 0)
        imported.categoryBreakdown.tagsBothPartial = newNGList.tags.both.partial.length - (existingNGList.tags?.both.partial.length || 0)
      }
      
      imported.totalItems = Object.values(imported.categoryBreakdown).reduce((sum, count) => sum + count, 0)
    }
    
    // 総数とタイムスタンプを更新
    newNGList.totalCount = 
      newNGList.videoIds.length +
      newNGList.videoTitles.exact.length +
      newNGList.videoTitles.partial.length +
      newNGList.authorIds.length +
      newNGList.authorNames.exact.length +
      newNGList.authorNames.partial.length +
      (newNGList.tags ? (
        newNGList.tags.locked.exact.length +
        newNGList.tags.locked.partial.length +
        newNGList.tags.user.exact.length +
        newNGList.tags.user.partial.length +
        newNGList.tags.both.exact.length +
        newNGList.tags.both.partial.length
      ) : 0)
    
    newNGList.updatedAt = new Date().toISOString()
    newNGList.version = 2 // 必ずversion 2として保存
    
    // localStorageに保存
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newNGList))
      
      // NGリスト更新イベントを発火
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { ngList: newNGList } 
      }))
    } catch (error) {
      throw new Error('NGリストの保存に失敗しました')
    }
    
    return {
      success: true,
      imported,
      skipped,
      errors,
      overwritten: conflictResolution === 'overwrite'
    }
  } catch (error) {
    return {
      success: false,
      imported: {
        totalItems: 0,
        categoryBreakdown: {
          videoIds: 0,
          videoTitlesExact: 0,
          videoTitlesPartial: 0,
          authorIds: 0,
          authorNamesExact: 0,
          authorNamesPartial: 0
        }
      },
      skipped: {
        totalItems: 0,
        reason: []
      },
      errors: [`インポート処理中にエラーが発生しました: ${error}`],
      overwritten: false
    }
  }
}

/**
 * ファイルから拡張版NGリストバックアップデータを読み込み
 */
export async function readExtendedNGListBackupFile(file: File): Promise<ExtendedNGListBackupData> {
  return new Promise((resolve, reject) => {
    // ファイルサイズチェック（5MB制限）
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('ファイルサイズが5MBを超えています'))
      return
    }
    
    // ファイル形式チェック
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      reject(new Error('JSONファイルを選択してください'))
      return
    }
    
    const reader = new FileReader()
    
    reader.onload = (event) => {
      try {
        const text = event.target?.result
        if (typeof text !== 'string') {
          reject(new Error('ファイルの読み込みに失敗しました'))
          return
        }

        const rawData = JSON.parse(text)

        if (validateExtendedNGListBackup(rawData)) {
          resolve(rawData)
          return
        }

        const aggregatedCandidate = rawData?.data?.ngList
        if (validateExtendedNGListBackup(aggregatedCandidate)) {
          resolve(aggregatedCandidate)
          return
        }

        reject(new Error('NGリストのバックアップファイルではありません'))
      } catch (error) {
        reject(new Error(`ファイルの読み込みに失敗しました: ${error}`))
      }
    }
    
    reader.onerror = () => {
      reject(new Error('ファイルの読み込みに失敗しました'))
    }
    
    reader.readAsText(file)
  })
}
