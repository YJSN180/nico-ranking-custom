/**
 * ブラウザストレージの永続化とSafari対策
 */

/**
 * Safariブラウザかどうかを判定
 */
export function isSafari(): boolean {
  if (typeof window === 'undefined') return false
  
  // テスト環境での Navigator アクセス
  const nav = typeof window !== 'undefined' ? window.navigator : (global as any).navigator
  if (!nav?.userAgent) return false
  
  const ua = nav.userAgent.toLowerCase()
  const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')
  
  // iOS Safari の検出
  const isIOSSafari = /iphone|ipad|ipod/.test(ua) && /webkit/.test(ua) && !ua.includes('crios')
  
  // Playwright WebKit の検出（E2Eテスト環境用）
  // Playwright WebKitは実際のSafariブラウザエンジンを使用しているため、Safari特有の問題も再現される
  const isPlaywrightWebkit = ua.includes('webkit') && ua.includes('version/') && !ua.includes('chrome')
  
  return isSafariBrowser || isIOSSafari || isPlaywrightWebkit
}

/**
 * ストレージの永続化を要求
 */
export async function requestPersistentStorage(): Promise<{
  granted: boolean
  persisted: boolean
}> {
  // テスト環境での Navigator アクセス
  const nav = typeof window !== 'undefined' ? window.navigator : (global as any).navigator
  
  // Persistent Storage APIがサポートされているか確認
  if (!nav?.storage?.persist || !nav?.storage?.persisted) {
    return { granted: false, persisted: false }
  }
  
  try {
    // 既に永続化されているか確認
    const alreadyPersisted = await nav.storage.persisted()
    
    if (alreadyPersisted) {
      return { granted: true, persisted: true }
    }
    
    // 永続化を要求
    const granted = await nav.storage.persist()
    
    return { granted, persisted: granted }
  } catch (error) {
    console.error('Failed to request persistent storage:', error)
    return { granted: false, persisted: false }
  }
}

/**
 * ストレージが永続化されているか確認
 */
export async function checkPersistentStorage(): Promise<boolean> {
  // テスト環境での Navigator アクセス
  const nav = typeof window !== 'undefined' ? window.navigator : (global as any).navigator
  
  if (!nav?.storage?.persisted) {
    return false
  }
  
  try {
    return await nav.storage.persisted()
  } catch {
    return false
  }
}

/**
 * 最終アクセス日時を保存
 */
export function saveLastAccessTime(): void {
  const now = new Date().toISOString()
  localStorage.setItem('nicoranking_last_access', now)
}

/**
 * 最終アクセス日時を取得
 */
export function getLastAccessTime(): Date | null {
  const timeStr = localStorage.getItem('nicoranking_last_access')
  if (!timeStr) return null
  
  try {
    const date = new Date(timeStr)
    // Invalid Date の場合は null を返す
    if (isNaN(date.getTime())) {
      return null
    }
    return date
  } catch {
    return null
  }
}

/**
 * 最終アクセスからの経過日数を取得
 */
export function getDaysSinceLastAccess(): number | null {
  const lastAccess = getLastAccessTime()
  if (!lastAccess) return null
  
  const now = new Date()
  const diffMs = now.getTime() - lastAccess.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  return diffDays
}

/**
 * バックアップリマインダーの設定を保存
 */
export interface ReminderSettings {
  enabled: boolean
  intervalDays: 3 | 5 | 7
  lastReminder: string | null
}

export function saveReminderSettings(settings: ReminderSettings): void {
  localStorage.setItem('nicoranking_reminder_settings', JSON.stringify(settings))
}

/**
 * バックアップリマインダーの設定を取得
 */
export function getReminderSettings(): ReminderSettings {
  const settingsStr = localStorage.getItem('nicoranking_reminder_settings')
  
  if (!settingsStr) {
    return {
      enabled: true,
      intervalDays: 5,
      lastReminder: null
    }
  }
  
  try {
    return JSON.parse(settingsStr)
  } catch {
    return {
      enabled: true,
      intervalDays: 5,
      lastReminder: null
    }
  }
}

/**
 * バックアップリマインダーを表示すべきか判定
 */
export function shouldShowBackupReminder(): boolean {
  const settings = getReminderSettings()
  
  if (!settings.enabled) {
    return false
  }
  
  if (!settings.lastReminder) {
    return true
  }
  
  try {
    const lastReminderDate = new Date(settings.lastReminder)
    const now = new Date()
    const diffMs = now.getTime() - lastReminderDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    return diffDays >= settings.intervalDays
  } catch {
    return true
  }
}

/**
 * バックアップリマインダーを表示したことを記録
 */
export function markReminderShown(): void {
  const settings = getReminderSettings()
  settings.lastReminder = new Date().toISOString()
  saveReminderSettings(settings)
}

/**
 * ストレージ使用量の推定
 */
export async function estimateStorageUsage(): Promise<{
  usage: number
  quota: number
  percentUsed: number
} | null> {
  // テスト環境での Navigator アクセス
  const nav = typeof window !== 'undefined' ? window.navigator : (global as any).navigator
  
  if (!nav?.storage?.estimate) {
    return null
  }
  
  try {
    const estimate = await nav.storage.estimate()
    const usage = estimate.usage || 0
    const quota = estimate.quota || 0
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0
    
    return {
      usage,
      quota,
      percentUsed
    }
  } catch {
    return null
  }
}