/**
 * NGリストデータのバックアップ・リストア機能
 * 
 * ⚠️ 重要: エクスポート・インポートのJSON形式は絶対に変更しないこと
 * このファイルで定義されているNGListBackupDataの形式は
 * ユーザーの既存バックアップファイルとの互換性を保つため、
 * 今後一切変更してはいけません。
 * 
 * 新しいフィールドを追加する場合は必ずオプショナル(?)として追加し、
 * 既存フィールドの削除・型変更は絶対に行わないでください。
 */

import type { UserNGList } from '@/hooks/use-user-ng-list'

/**
 * NGリストバックアップデータの形式
 * 
 * ⚠️ JSON形式仕様（変更禁止）:
 * {
 *   "version": "1.0.0",               // バックアップ形式のバージョン（必須）
 *   "exportDate": "2025-07-06...",   // エクスポート日時ISO文字列（必須）
 *   "exportSource": "settings-applied", // エクスポート元（必須）
 *   "ngList": {...},                 // UserNGList型（必須）
 *   "metadata": {                    // メタデータ（必須）
 *     "totalItems": 100,             // 全アイテム総数（必須）
 *     "categoryBreakdown": {...},    // カテゴリ別内訳（必須）
 *     "appVersion": "1.0.0"          // アプリバージョン（必須）
 *   }
 * }
 */
export interface NGListBackupData {
  version: string
  exportDate: string
  exportSource: 'settings-applied'
  ngList: UserNGList
  metadata: {
    totalItems: number
    categoryBreakdown: {
      videoIds: number
      videoTitlesExact: number
      videoTitlesPartial: number
      authorIds: number
      authorNamesExact: number
      authorNamesPartial: number
    }
    appVersion: string
  }
}

/**
 * 重複検出結果
 */
export interface ConflictDetectionResult {
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
  }
  inclusions: {
    videoTitles: Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
    authorNames: Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
  }
}

/**
 * インポート結果
 */
export interface NGListImportResult {
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
 * 適用済みNGリストデータをエクスポート
 * 設定モーダルで未適用の一時的な変更は含めない
 */
export function exportNGListData(): NGListBackupData {
  // localStorageから適用済みのNGリストを取得
  const STORAGE_KEY = 'user-ng-list'
  let ngList: UserNGList
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      throw new Error('NGリストデータが見つかりません')
    }
    
    ngList = JSON.parse(stored)
    
    // バージョンチェック
    if (ngList.version !== 1) {
      throw new Error('サポートされていないNGリストバージョンです')
    }
  } catch (error) {
    throw new Error(`NGリストの読み込みに失敗しました: ${error}`)
  }
  
  // カテゴリ別内訳を計算
  const categoryBreakdown = {
    videoIds: ngList.videoIds.length,
    videoTitlesExact: ngList.videoTitles.exact.length,
    videoTitlesPartial: ngList.videoTitles.partial.length,
    authorIds: ngList.authorIds.length,
    authorNamesExact: ngList.authorNames.exact.length,
    authorNamesPartial: ngList.authorNames.partial.length
  }
  
  const totalItems = Object.values(categoryBreakdown).reduce((sum, count) => sum + count, 0)
  
  // バックアップデータを構築
  const backupData: NGListBackupData = {
    version: '1.0.0',
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
 * バックアップデータをダウンロード
 */
export function downloadNGListBackup(data: NGListBackupData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  if (typeof (blob as any).text !== 'function') {
    ;(blob as any).text = () => Promise.resolve(json)
  }
  const url = URL.createObjectURL(blob)
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `nico-ranking-ng-list-backup-${timestamp}.json`
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  
  URL.revokeObjectURL(url)
}

/**
 * NGリストバックアップデータの妥当性を検証
 */
export function validateNGListBackup(data: unknown): data is NGListBackupData {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  
  const backup = data as Record<string, unknown>
  
  // 必須フィールドの存在確認
  if (!backup.version || typeof backup.version !== 'string') {
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
  
  // NGリストの構造を検証
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
  
  return true
}

/**
 * 重複と包含関係を検出
 */
export function detectConflicts(existingNGList: UserNGList, importingNGList: UserNGList): ConflictDetectionResult {
  const conflicts = {
    videoIds: [] as string[],
    videoTitles: {
      exact: [] as string[],
      partial: [] as string[]
    },
    authorIds: [] as string[],
    authorNames: {
      exact: [] as string[],
      partial: [] as string[]
    }
  }
  
  const inclusions = {
    videoTitles: [] as Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>,
    authorNames: [] as Array<{ existing: string; importing: string; type: 'existing_includes_importing' | 'importing_includes_existing' }>
  }
  
  // 動画ID重複検出
  conflicts.videoIds = importingNGList.videoIds.filter(id => 
    existingNGList.videoIds.includes(id)
  )
  
  // 動画タイトル重複検出
  conflicts.videoTitles.exact = importingNGList.videoTitles.exact.filter(title =>
    existingNGList.videoTitles.exact.includes(title)
  )
  
  conflicts.videoTitles.partial = importingNGList.videoTitles.partial.filter(title =>
    existingNGList.videoTitles.partial.includes(title)
  )
  
  // 投稿者ID重複検出
  conflicts.authorIds = importingNGList.authorIds.filter(id =>
    existingNGList.authorIds.includes(id)
  )
  
  // 投稿者名重複検出
  conflicts.authorNames.exact = importingNGList.authorNames.exact.filter(name =>
    existingNGList.authorNames.exact.includes(name)
  )
  
  conflicts.authorNames.partial = importingNGList.authorNames.partial.filter(name =>
    existingNGList.authorNames.partial.includes(name)
  )
  
  // 部分一致の包含関係検出（動画タイトル）
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
  
  // 部分一致の包含関係検出（投稿者名）
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
  
  const hasConflicts = 
    conflicts.videoIds.length > 0 ||
    conflicts.videoTitles.exact.length > 0 ||
    conflicts.videoTitles.partial.length > 0 ||
    conflicts.authorIds.length > 0 ||
    conflicts.authorNames.exact.length > 0 ||
    conflicts.authorNames.partial.length > 0 ||
    inclusions.videoTitles.length > 0 ||
    inclusions.authorNames.length > 0
  
  return {
    hasConflicts,
    conflicts,
    inclusions
  }
}

/**
 * NGリストデータをインポート
 */
export function importNGListData(
  data: NGListBackupData,
  conflictResolution: 'overwrite' | 'merge' = 'merge'
): NGListImportResult {
  const errors: string[] = []
  let imported = {
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
    let existingNGList: UserNGList
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        existingNGList = JSON.parse(stored)
      } else {
        // 初期データ
        existingNGList = {
          videoIds: [],
          videoTitles: { exact: [], partial: [] },
          authorIds: [],
          authorNames: { exact: [], partial: [] },
          version: 1,
          totalCount: 0,
          updatedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      throw new Error('既存のNGリストデータの読み込みに失敗しました')
    }
    
    // 重複検出
    const conflicts = detectConflicts(existingNGList, data.ngList)
    
    // インポート処理
    const newNGList: UserNGList = { ...existingNGList }
    
    if (conflictResolution === 'overwrite') {
      // 上書きモード：インポートデータで完全に置き換え
      newNGList.videoIds = [...data.ngList.videoIds]
      newNGList.videoTitles = {
        exact: [...data.ngList.videoTitles.exact],
        partial: [...data.ngList.videoTitles.partial]
      }
      newNGList.authorIds = [...data.ngList.authorIds]
      newNGList.authorNames = {
        exact: [...data.ngList.authorNames.exact],
        partial: [...data.ngList.authorNames.partial]
      }
      
      imported = { 
        totalItems: data.metadata.totalItems,
        categoryBreakdown: { ...data.metadata.categoryBreakdown }
      }
    } else if (conflictResolution === 'merge') {
      // マージモード：重複を除いて結合
      newNGList.videoIds = [...new Set([...existingNGList.videoIds, ...data.ngList.videoIds])]
      newNGList.videoTitles = {
        exact: [...new Set([...existingNGList.videoTitles.exact, ...data.ngList.videoTitles.exact])],
        partial: [...new Set([...existingNGList.videoTitles.partial, ...data.ngList.videoTitles.partial])]
      }
      newNGList.authorIds = [...new Set([...existingNGList.authorIds, ...data.ngList.authorIds])]
      newNGList.authorNames = {
        exact: [...new Set([...existingNGList.authorNames.exact, ...data.ngList.authorNames.exact])],
        partial: [...new Set([...existingNGList.authorNames.partial, ...data.ngList.authorNames.partial])]
      }
      
      // インポートされた新しいアイテム数を計算
      imported.categoryBreakdown.videoIds = newNGList.videoIds.length - existingNGList.videoIds.length
      imported.categoryBreakdown.videoTitlesExact = newNGList.videoTitles.exact.length - existingNGList.videoTitles.exact.length
      imported.categoryBreakdown.videoTitlesPartial = newNGList.videoTitles.partial.length - existingNGList.videoTitles.partial.length
      imported.categoryBreakdown.authorIds = newNGList.authorIds.length - existingNGList.authorIds.length
      imported.categoryBreakdown.authorNamesExact = newNGList.authorNames.exact.length - existingNGList.authorNames.exact.length
      imported.categoryBreakdown.authorNamesPartial = newNGList.authorNames.partial.length - existingNGList.authorNames.partial.length
      imported.totalItems = Object.values(imported.categoryBreakdown).reduce((sum, count) => sum + count, 0)
    }
    
    // 総数とタイムスタンプを更新
    newNGList.totalCount = 
      newNGList.videoIds.length +
      newNGList.videoTitles.exact.length +
      newNGList.videoTitles.partial.length +
      newNGList.authorIds.length +
      newNGList.authorNames.exact.length +
      newNGList.authorNames.partial.length
    
    newNGList.updatedAt = new Date().toISOString()
    
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
 * ファイルからNGリストバックアップデータを読み込み
 */
export async function readNGListBackupFile(file: File): Promise<NGListBackupData> {
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
        const text = event.target?.result as string
        const data = JSON.parse(text)
        
        if (!validateNGListBackup(data)) {
          reject(new Error('NGリストのバックアップファイルではありません'))
          return
        }
        
        resolve(data)
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
