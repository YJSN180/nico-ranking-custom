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
 * バックアップデータをインポート
 */
export async function importMylistData(data: BackupData): Promise<{
  success: boolean
  imported: {
    mylists: number
    videos: number
  }
  errors: string[]
  overwritten: number
}> {
  const errors: string[] = []
  let importedMylists = 0
  let importedVideos = 0
  let overwrittenMylists = 0
  
  try {
    const dbManager = new DBManager()
    await dbManager.init()
    const db = dbManager.getDB()
    
    if (!db) {
      throw new Error('Database not initialized')
    }
    
    // トランザクションを開始
    const tx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
    
    // マイリストをインポート
    for (const mylist of data.mylists) {
      try {
        // 既存のマイリストを確認
        const existing = await tx.objectStore('mylists').get(mylist.id)
        if (existing) {
          overwrittenMylists++
        }
        
        await tx.objectStore('mylists').put(mylist)
        importedMylists++
      } catch (error) {
        errors.push(`マイリスト「${mylist.name}」のインポートに失敗: ${error}`)
      }
    }
    
    // マイリスト動画をインポート
    for (const mv of data.mylistVideos) {
      try {
        await tx.objectStore('mylistVideos').put(mv)
        importedVideos++
      } catch (error) {
        errors.push(`動画関連データのインポートに失敗: ${error}`)
      }
    }
    
    await tx.done
    
    return {
      success: errors.length === 0,
      imported: {
        mylists: importedMylists,
        videos: importedVideos
      },
      errors,
      overwritten: overwrittenMylists
    }
  } catch (error) {
    return {
      success: false,
      imported: {
        mylists: 0,
        videos: 0
      },
      errors: [`インポート処理中にエラーが発生しました: ${error}`],
      overwritten: 0
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