/**
 * マイリストデータのバックアップ・リストア機能
 */

import { DBManager } from './db-manager'
import type { Mylist, MylistVideo } from './types'

export interface BackupData {
  version: string
  exportDate: string
  mylists: Mylist[]
  mylistVideos: MylistVideo[]
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
  const mylistVideos = await tx.objectStore('mylistVideos').getAll()
  
  await tx.done
  
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