import type { Mylist } from '@/lib/storage/types'

// 重い DBManager と MylistManager を動的インポートでロード
export async function initializeStorage() {
  const { DBManager } = await import('@/lib/storage/db-manager')
  const { MylistManager } = await import('@/lib/storage/mylists')
  
  const dbManager = new DBManager()
  await dbManager.init()
  const mylistManager = new MylistManager(dbManager)
  
  return { dbManager, mylistManager }
}

// ストレージ使用量情報を取得
export async function getStorageInfo() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate()
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      }
    } catch (error) {
      console.error('Failed to get storage info:', error)
      return { used: 0, quota: 0 }
    }
  }
  return { used: 0, quota: 0 }
}