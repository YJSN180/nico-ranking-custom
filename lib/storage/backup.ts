/**
 * マイリストデータのバックアップ・リストア機能
 * 
 * ⚠️ 重要: エクスポート・インポートのJSON形式は絶対に変更しないこと
 * このファイルで定義されているBackupDataとExportMylistVideoの形式は
 * ユーザーの既存バックアップファイルとの互換性を保つため、
 * 今後一切変更してはいけません。
 * 
 * 新しいフィールドを追加する場合は必ずオプショナル(?)として追加し、
 * 既存フィールドの削除・型変更は絶対に行わないでください。
 */

import { DBManager } from './db-manager'
import type { Mylist, MylistVideo } from './types'

/**
 * エクスポート時の動画データ（統計情報を除外）
 * 
 * ⚠️ JSON形式仕様（変更禁止）:
 * {
 *   "id": "sm12345",              // 動画ID（必須）
 *   "mylistId": "uuid-string",    // マイリストID（必須）
 *   "title": "動画タイトル",       // タイトル（必須）
 *   "thumbURL": "https://...",    // サムネイルURL（必須）
 *   "addedAt": 1234567890000,     // 追加日時のタイムスタンプ（必須）
 *   "memo": "メモ内容",           // メモ（オプション）
 *   "orderIndex": 0,              // 並び順（オプション）
 *   "duration": 300,              // 再生時間（秒）（オプション）
 *   "registeredAt": "2025-07-06T10:00:00.000Z", // 動画投稿日時（オプション）
 *   "authorName": "投稿者名",     // 投稿者名（オプション）
 *   "authorId": "123456",         // 投稿者ID（オプション）
 *   "authorIcon": "https://..."   // 投稿者アイコンURL（オプション）
 * }
 */
interface ExportMylistVideo {
  id: string
  mylistId: string
  title: string
  thumbURL: string
  addedAt: number
  memo?: string
  orderIndex?: number
  duration?: number
  registeredAt?: string  // 動画投稿日時（並び替えに必要）
  authorName?: string    // 投稿者名（表示用）
  authorId?: string      // 投稿者ID
  authorIcon?: string    // 投稿者アイコンURL
}

/**
 * 重複検出結果
 */
export interface MylistConflictDetectionResult {
  hasConflicts: boolean
  conflicts: {
    // マイリストID重複
    mylistIds: Array<{
      id: string
      existingName: string
      importingName: string
      existingVideoCount: number
      importingVideoCount: number
    }>
    // マイリスト名重複（異なるID）
    mylistNames: Array<{
      name: string
      existingId: string
      importingId: string
      existingVideoCount: number
      importingVideoCount: number
    }>
    // 動画重複
    videos: Array<{
      id: string
      title: string
      existingMylistId: string
      existingMylistName: string
      importingMylistId: string
      importingMylistName: string
      conflictType: 'same_mylist' | 'different_mylist'
    }>
  }
  summary: {
    totalConflictingMylists: number
    totalConflictingVideos: number
    importingMylists: number
    importingVideos: number
  }
}

/**
 * インポート結果
 */
export interface MylistImportResult {
  success: boolean
  imported: {
    mylists: number
    videos: number
  }
  created: {
    mylists: number
    videos: number
  }
  overwritten: {
    mylists: number
    videos: number
  }
  skipped: {
    mylists: number
    videos: number
    reason: string[]
  }
  renamed: {
    mylists: Array<{ original: string; renamed: string }>
  }
  errors: string[]
  message?: string
}

/**
 * バックアップデータの形式
 * 
 * ⚠️ JSON形式仕様（変更禁止）:
 * {
 *   "version": "1.0.0",           // バックアップ形式のバージョン（必須）
 *   "exportDate": "2025-07-06...", // エクスポート日時ISO文字列（必須）
 *   "mylists": [...],             // Mylist型の配列（必須）
 *   "mylistVideos": [...],        // ExportMylistVideo型の配列（必須）
 *   "metadata": {                 // メタデータ（必須）
 *     "totalMylists": 5,          // マイリスト総数（必須）
 *     "totalVideos": 100,         // 動画総数（必須）
 *     "appVersion": "1.0.0"       // アプリバージョン（必須）
 *   }
 * }
 * 
 * Mylist型の仕様（lib/storage/types.tsで定義）:
 * {
 *   "id": "uuid-string",          // マイリストID（必須）
 *   "name": "マイリスト名",        // 名前（必須）
 *   "description": "説明",        // 説明（オプション）
 *   "createdAt": 1234567890000,   // 作成日時（必須）
 *   "updatedAt": 1234567890000,   // 更新日時（必須）
 *   "videoCount": 10              // 動画数（必須）
 * }
 */
export interface BackupData {
  version: string
  exportDate: string
  mylists: Mylist[]
  mylistVideos: ExportMylistVideo[]
  metadata: {
    totalMylists: number
    totalVideos: number
    appVersion: string
  }
}

/**
 * マイリストデータをエクスポート
 */
export async function exportMylistData(): Promise<BackupData> {
  const dbManager = new DBManager()
  await dbManager.init()
  const db = dbManager.getDB()
  
  if (!db) {
    throw new Error('Database not initialized')
  }
  
  // トランザクションを開始
  const tx = db.transaction(['mylists', 'mylistVideos'], 'readonly')
  
  // 全マイリストを取得
  const mylists = await tx.objectStore('mylists').getAll()
  
  // 全マイリスト動画関連を取得
  const allMylistVideos = await tx.objectStore('mylistVideos').getAll()
  
  await tx.done
  
  // 動画統計情報を除外して必要最小限の情報のみ保持
  const mylistVideos = allMylistVideos.map(video => ({
    id: video.id,
    mylistId: video.mylistId,
    title: video.title,
    thumbURL: video.thumbURL,
    addedAt: video.addedAt,
    ...(video.memo && { memo: video.memo }),
    ...(video.orderIndex !== undefined && { orderIndex: video.orderIndex }),
    ...(video.duration !== undefined && { duration: video.duration }),
    ...(video.registeredAt && { registeredAt: video.registeredAt }),
    ...(video.authorName && { authorName: video.authorName }),
    ...(video.authorId && { authorId: video.authorId }),
    ...(video.authorIcon && { authorIcon: video.authorIcon })
  }))
  
  // バックアップデータを構築
  const backupData: BackupData = {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    mylists,
    mylistVideos,
    metadata: {
      totalMylists: mylists.length,
      totalVideos: mylistVideos.length,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'
    }
  }
  
  return backupData
}

/**
 * バックアップデータをダウンロード
 */
export function downloadBackupData(data: BackupData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `nico-ranking-backup-${timestamp}.json`
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  
  URL.revokeObjectURL(url)
}

/**
 * バックアップデータの妥当性を検証
 */
export function validateBackupData(data: unknown): data is BackupData {
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
  
  if (!Array.isArray(backup.mylists)) {
    return false
  }
  
  if (!Array.isArray(backup.mylistVideos)) {
    return false
  }
  
  if (!backup.metadata || typeof backup.metadata !== 'object') {
    return false
  }
  
  // マイリストの構造を検証
  for (const mylist of backup.mylists as unknown[]) {
    if (typeof mylist !== 'object' || mylist === null) {
      return false
    }
    
    const m = mylist as Record<string, unknown>
    if (typeof m.id !== 'string' || typeof m.name !== 'string') {
      return false
    }
  }
  
  // マイリスト動画の構造を検証
  for (const mv of backup.mylistVideos as unknown[]) {
    if (typeof mv !== 'object' || mv === null) {
      return false
    }
    
    const mvRecord = mv as Record<string, unknown>
    if (typeof mvRecord.mylistId !== 'string' || typeof mvRecord.id !== 'string') {
      return false
    }
  }
  
  return true
}

/**
 * ユニークなマイリスト名を生成
 */
function generateUniqueMylistName(baseName: string, existingNames: string[]): string {
  let counter = 2
  let newName = `${baseName} (${counter})`
  
  while (existingNames.includes(newName)) {
    counter++
    newName = `${baseName} (${counter})`
  }
  
  return newName
}

/**
 * 新しいUUIDを生成
 */
function generateUniqueMylistId(): string {
  return 'mylist-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
}

/**
 * 重複と競合関係を検出
 */
export async function detectMylistConflicts(importingData: BackupData): Promise<MylistConflictDetectionResult> {
  const dbManager = new DBManager()
  await dbManager.init()
  const db = dbManager.getDB()
  
  if (!db) {
    throw new Error('Database not initialized')
  }
  
  const tx = db.transaction(['mylists', 'mylistVideos'], 'readonly')
  
  // 既存のマイリストとマイリスト動画を取得
  const existingMylists = await tx.objectStore('mylists').getAll()
  const existingMylistVideos = await tx.objectStore('mylistVideos').getAll()
  
  await tx.done
  
  const conflicts = {
    mylistIds: [] as Array<{
      id: string
      existingName: string
      importingName: string
      existingVideoCount: number
      importingVideoCount: number
    }>,
    mylistNames: [] as Array<{
      name: string
      existingId: string
      importingId: string
      existingVideoCount: number
      importingVideoCount: number
    }>,
    videos: [] as Array<{
      id: string
      title: string
      existingMylistId: string
      existingMylistName: string
      importingMylistId: string
      importingMylistName: string
      conflictType: 'same_mylist' | 'different_mylist'
    }>
  }
  
  // マイリストID重複検出
  for (const importingMylist of importingData.mylists) {
    const existingMylist = existingMylists.find(m => m.id === importingMylist.id)
    if (existingMylist) {
      const existingVideoCount = existingMylistVideos.filter(v => v.mylistId === importingMylist.id).length
      const importingVideoCount = importingData.mylistVideos.filter(v => v.mylistId === importingMylist.id).length
      
      conflicts.mylistIds.push({
        id: importingMylist.id,
        existingName: existingMylist.name,
        importingName: importingMylist.name,
        existingVideoCount,
        importingVideoCount
      })
    }
  }
  
  // マイリスト名重複検出（異なるID）
  for (const importingMylist of importingData.mylists) {
    // ID重複は既にチェック済みなのでスキップ
    if (conflicts.mylistIds.some(c => c.id === importingMylist.id)) {
      continue
    }
    
    const existingMylist = existingMylists.find(m => m.name === importingMylist.name)
    if (existingMylist) {
      const existingVideoCount = existingMylistVideos.filter(v => v.mylistId === existingMylist.id).length
      const importingVideoCount = importingData.mylistVideos.filter(v => v.mylistId === importingMylist.id).length
      
      conflicts.mylistNames.push({
        name: importingMylist.name,
        existingId: existingMylist.id,
        importingId: importingMylist.id,
        existingVideoCount,
        importingVideoCount
      })
    }
  }
  
  // 動画重複検出
  for (const importingVideo of importingData.mylistVideos) {
    const existingVideo = existingMylistVideos.find(v => v.id === importingVideo.id)
    if (existingVideo) {
      const conflictType = existingVideo.mylistId === importingVideo.mylistId ? 'same_mylist' : 'different_mylist'
      const existingMylistName = existingMylists.find(m => m.id === existingVideo.mylistId)?.name || 'Unknown'
      const importingMylistName = importingData.mylists.find(m => m.id === importingVideo.mylistId)?.name || 'Unknown'
      
      conflicts.videos.push({
        id: importingVideo.id,
        title: importingVideo.title,
        existingMylistId: existingVideo.mylistId,
        existingMylistName,
        importingMylistId: importingVideo.mylistId,
        importingMylistName,
        conflictType
      })
    }
  }
  
  const hasConflicts = 
    conflicts.mylistIds.length > 0 || 
    conflicts.mylistNames.length > 0 || 
    conflicts.videos.length > 0
  
  return {
    hasConflicts,
    conflicts,
    summary: {
      totalConflictingMylists: conflicts.mylistIds.length + conflicts.mylistNames.length,
      totalConflictingVideos: conflicts.videos.length,
      importingMylists: importingData.mylists.length,
      importingVideos: importingData.mylistVideos.length
    }
  }
}

/**
 * バックアップデータをインポート
 */
export async function importMylistData(
  data: BackupData,
  conflictResolution: 'safe_add' | 'smart_merge' | 'complete_overwrite' = 'safe_add'
): Promise<MylistImportResult> {
  const errors: string[] = []
  let importedMylists = 0
  let importedVideos = 0
  let createdMylists = 0
  let createdVideos = 0
  let overwrittenMylists = 0
  let overwrittenVideos = 0
  const skipped = {
    mylists: 0,
    videos: 0,
    reason: [] as string[]
  }
  const renamed: Array<{ original: string; renamed: string }> = []
  
  try {
    const dbManager = new DBManager()
    await dbManager.init()
    const db = dbManager.getDB()
    
    if (!db) {
      throw new Error('Database not initialized')
    }
    
    // 既存データを取得
    let tx = db.transaction(['mylists', 'mylistVideos'], 'readonly')
    const existingMylists = await tx.objectStore('mylists').getAll()
    const existingMylistVideos = await tx.objectStore('mylistVideos').getAll()
    await tx.done
    
    // 完全上書きモードの場合、全データを削除
    if (conflictResolution === 'complete_overwrite') {
      const deleteTx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
      await deleteTx.objectStore('mylists').clear()
      await deleteTx.objectStore('mylistVideos').clear()
      await deleteTx.done
    }
    
    // インポート用トランザクション開始
    const importTx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
    
    // 既存の名前リストを構築（リネーム検出用）
    const existingNames = existingMylists.map(m => m.name)
    
    // マイリストをインポート
    for (const importingMylist of data.mylists) {
      try {
        let mylistToImport = { ...importingMylist }
        
        if (conflictResolution === 'complete_overwrite') {
          // 完全上書き：そのまま追加
          await importTx.objectStore('mylists').put(mylistToImport)
          importedMylists++
          createdMylists++
        } else {
          const existingMylist = existingMylists.find(m => m.id === importingMylist.id)
          const nameConflict = existingMylists.find(m => m.name === importingMylist.name && m.id !== importingMylist.id)
          
          if (existingMylist) {
            // ID重複あり
            if (conflictResolution === 'safe_add') {
              // 安全追加：新IDで作成
              mylistToImport.id = generateUniqueMylistId()
              if (nameConflict) {
                const newName = generateUniqueMylistName(importingMylist.name, existingNames)
                mylistToImport.name = newName
                renamed.push({ original: importingMylist.name, renamed: newName })
                existingNames.push(newName)
              }
              await importTx.objectStore('mylists').put(mylistToImport)
              importedMylists++
              createdMylists++
            } else if (conflictResolution === 'smart_merge') {
              // スマートマージ：既存を上書き
              await importTx.objectStore('mylists').put(mylistToImport)
              importedMylists++
              overwrittenMylists++
            }
          } else if (nameConflict) {
            // 名前重複のみ
            if (conflictResolution === 'safe_add' || conflictResolution === 'smart_merge') {
              const newName = generateUniqueMylistName(importingMylist.name, existingNames)
              mylistToImport.name = newName
              renamed.push({ original: importingMylist.name, renamed: newName })
              existingNames.push(newName)
              await importTx.objectStore('mylists').put(mylistToImport)
              importedMylists++
              createdMylists++
            }
          } else {
            // 重複なし：そのまま追加
            await importTx.objectStore('mylists').put(mylistToImport)
            importedMylists++
            createdMylists++
          }
        }
      } catch (error) {
        errors.push(`マイリスト「${importingMylist.name}」のインポートに失敗: ${error}`)
      }
    }
    
    // マイリスト動画をインポート
    for (const importingVideo of data.mylistVideos) {
      try {
        let videoToImport = { ...importingVideo }
        
        if (conflictResolution === 'complete_overwrite') {
          // 完全上書き：そのまま追加
          await importTx.objectStore('mylistVideos').put(videoToImport)
          importedVideos++
          createdVideos++
        } else {
          // 既存動画の検索（プライマリキーでの検索を試行）
          let existingVideo = existingMylistVideos.find(v => v.id === importingVideo.id)
          if (!existingVideo) {
            // メモリ上で見つからない場合は直接DBから検索
            try {
              existingVideo = await importTx.objectStore('mylistVideos').get(importingVideo.id)
            } catch (error) {
              // 検索エラーは無視
            }
          }
          
          // マイリストIDの変更を反映（安全追加でIDが変更された場合）
          const originalMylist = data.mylists.find(m => m.id === importingVideo.mylistId)
          if (originalMylist) {
            const renamedEntry = renamed.find(r => r.original === originalMylist.name)
            if (renamedEntry) {
              // 新しいマイリストIDを見つける - getAll()を使用してから検索
              const allMylists = await importTx.objectStore('mylists').getAll()
              const newMylist = allMylists.find(m => m.name === renamedEntry.renamed)
              if (newMylist) {
                videoToImport.mylistId = newMylist.id
              }
            }
          }
          
          if (existingVideo) {
            // 動画重複あり
            if (conflictResolution === 'safe_add') {
              // 安全追加：重複を許可（異なるマイリストの場合）
              if (existingVideo.mylistId !== videoToImport.mylistId) {
                await importTx.objectStore('mylistVideos').put(videoToImport)
                importedVideos++
                createdVideos++
              } else {
                // 同一マイリスト内重複はスキップ
                skipped.videos++
                skipped.reason.push(`動画「${importingVideo.title}」は既に同じマイリストに存在します`)
              }
            } else if (conflictResolution === 'smart_merge') {
              // スマートマージ：同一マイリスト内は除去、異なるマイリスト間は許可
              if (existingVideo.mylistId === videoToImport.mylistId) {
                // 同一マイリスト内：上書き
                await importTx.objectStore('mylistVideos').put(videoToImport)
                importedVideos++
                overwrittenVideos++
              } else {
                // 異なるマイリスト間：重複許可
                await importTx.objectStore('mylistVideos').put(videoToImport)
                importedVideos++
                createdVideos++
              }
            }
          } else {
            // 重複なし：そのまま追加
            await importTx.objectStore('mylistVideos').put(videoToImport)
            importedVideos++
            createdVideos++
          }
        }
      } catch (error) {
        errors.push(`動画関連データのインポートに失敗: ${error}`)
      }
    }
    
    await importTx.done
    
    const message = conflictResolution === 'complete_overwrite' 
      ? '既存データを完全に置き換えました'
      : conflictResolution === 'smart_merge'
      ? 'データをスマートマージしました'
      : '安全にデータを追加しました'
    
    return {
      success: errors.length === 0,
      imported: {
        mylists: importedMylists,
        videos: importedVideos
      },
      created: {
        mylists: createdMylists,
        videos: createdVideos
      },
      overwritten: {
        mylists: overwrittenMylists,
        videos: overwrittenVideos
      },
      skipped,
      renamed: {
        mylists: renamed
      },
      errors,
      message
    }
  } catch (error) {
    return {
      success: false,
      imported: {
        mylists: 0,
        videos: 0
      },
      created: {
        mylists: 0,
        videos: 0
      },
      overwritten: {
        mylists: 0,
        videos: 0
      },
      skipped: {
        mylists: 0,
        videos: 0,
        reason: []
      },
      renamed: {
        mylists: []
      },
      errors: [`インポート処理中にエラーが発生しました: ${error}`]
    }
  }
}

/**
 * ファイルからバックアップデータを読み込み
 */
export async function readBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const data = JSON.parse(text)
        
        if (!validateBackupData(data)) {
          reject(new Error('無効なファイル形式です'))
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