/**
 * Safari persistence utilities unit tests
 * Safari 7日制限対策の機能をユニットテストでカバー
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isSafari,
  requestPersistentStorage,
  checkPersistentStorage,
  saveLastAccessTime,
  getLastAccessTime,
  getDaysSinceLastAccess,
  getReminderSettings,
  saveReminderSettings,
  shouldShowBackupReminder,
  markReminderShown,
  estimateStorageUsage,
  type ReminderSettings
} from '@/lib/storage/persistence'

// localStorage のモック
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  })
}

// navigator.storage のモック
const storageAPISuccess = {
  persisted: vi.fn().mockResolvedValue(false),
  persist: vi.fn().mockResolvedValue(true),
  estimate: vi.fn().mockResolvedValue({
    usage: 1024 * 1024, // 1MB
    quota: 100 * 1024 * 1024 // 100MB
  })
}

const storageAPIFailure = {
  persisted: vi.fn().mockRejectedValue(new Error('Storage API error')),
  persist: vi.fn().mockRejectedValue(new Error('Storage API error')),
  estimate: vi.fn().mockRejectedValue(new Error('Storage API error'))
}

// global オブジェクトのモック設定
beforeEach(() => {
  // localStorage をグローバルにセット
  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
  })
  
  // localStorageMock をリセット
  localStorageMock.store = {}
  vi.clearAllMocks()
  
  // デフォルトの navigator 作成
  const defaultNavigator = {
    userAgent: '',
    storage: storageAPISuccess
  }
  
  // navigator をグローバルにセット
  Object.defineProperty(global, 'navigator', {
    value: defaultNavigator,
    writable: true,
    configurable: true
  })
  
  // window オブジェクトのモック
  Object.defineProperty(global, 'window', {
    value: {
      navigator: defaultNavigator
    },
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  
  // localStorageMock をリセット
  localStorageMock.store = {}
  
  // 完全に新しいStorageAPIモックを作成
  const freshStorageAPI = {
    persisted: vi.fn().mockResolvedValue(false),
    persist: vi.fn().mockResolvedValue(true),
    estimate: vi.fn().mockResolvedValue({
      usage: 1024 * 1024,
      quota: 100 * 1024 * 1024
    })
  }
  
  // Navigator を完全に新しいオブジェクトで上書き
  const freshNavigator = {
    userAgent: '',
    storage: freshStorageAPI
  }
  
  // global.navigator を削除してから再作成
  delete (global as any).navigator
  delete (global as any).window
  
  Object.defineProperty(global, 'navigator', {
    value: freshNavigator,
    writable: true,
    configurable: true
  })
  
  Object.defineProperty(global, 'window', {
    value: {
      navigator: freshNavigator
    },
    writable: true,
    configurable: true
  })
  
  // storageAPISuccess の参照を更新
  Object.assign(storageAPISuccess, freshStorageAPI)
})

describe('Safari Detection Tests', () => {
  it('should detect desktop Safari browser', () => {
    // Desktop Safari のユーザーエージェント
    const navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      storage: storageAPISuccess
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    expect(isSafari()).toBe(true)
  })
  
  it('should detect iOS Safari browser', () => {
    // iOS Safari のユーザーエージェント
    const navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
      storage: storageAPISuccess
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    expect(isSafari()).toBe(true)
  })
  
  it('should detect Playwright WebKit (test environment)', () => {
    // Playwright WebKit のユーザーエージェント
    const navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      storage: storageAPISuccess
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    expect(isSafari()).toBe(true)
  })
  
  it('should not detect Chrome as Safari', () => {
    const navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      storage: storageAPISuccess
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    expect(isSafari()).toBe(false)
  })
  
  it('should not detect Firefox as Safari', () => {
    const navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
      storage: storageAPISuccess
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    expect(isSafari()).toBe(false)
  })
  
  it('should return false in server-side environment', () => {
    // window オブジェクトを削除
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
      configurable: true
    })
    
    expect(isSafari()).toBe(false)
  })
})

describe('Persistent Storage Tests', () => {
  it('should successfully request persistent storage', async () => {
    const result = await requestPersistentStorage()
    
    expect(result.granted).toBe(true)
    expect(result.persisted).toBe(true)
    expect(storageAPISuccess.persisted).toHaveBeenCalled()
    expect(storageAPISuccess.persist).toHaveBeenCalled()
  })
  
  it('should handle already persisted storage', async () => {
    // 既に永続化済みの場合
    storageAPISuccess.persisted.mockResolvedValueOnce(true)
    
    const result = await requestPersistentStorage()
    
    expect(result.granted).toBe(true)
    expect(result.persisted).toBe(true)
    expect(storageAPISuccess.persisted).toHaveBeenCalled()
    expect(storageAPISuccess.persist).not.toHaveBeenCalled()
  })
  
  it('should handle storage API not supported', async () => {
    // Storage API がサポートされていない場合
    const navigator = {
      userAgent: '',
      storage: undefined
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    const result = await requestPersistentStorage()
    
    expect(result.granted).toBe(false)
    expect(result.persisted).toBe(false)
  })
  
  it('should handle storage API error', async () => {
    // 独立したエラーAPIモックを作成
    const errorStorageAPI = {
      persisted: vi.fn().mockRejectedValue(new Error('Storage API error')),
      persist: vi.fn().mockRejectedValue(new Error('Storage API error')),
      estimate: vi.fn().mockRejectedValue(new Error('Storage API error'))
    }
    
    const navigator = {
      userAgent: '',
      storage: errorStorageAPI
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    const result = await requestPersistentStorage()
    
    expect(result.granted).toBe(false)
    expect(result.persisted).toBe(false)
  })
  
  it('should check persistent storage status', async () => {
    const result = await checkPersistentStorage()
    
    expect(result).toBe(false)
    expect(storageAPISuccess.persisted).toHaveBeenCalled()
  })
  
  it('should handle check persistent storage error', async () => {
    // 独立したエラーAPIモックを作成
    const errorStorageAPI = {
      persisted: vi.fn().mockRejectedValue(new Error('Storage API error')),
      persist: vi.fn().mockRejectedValue(new Error('Storage API error')),
      estimate: vi.fn().mockRejectedValue(new Error('Storage API error'))
    }
    
    const navigator = {
      userAgent: '',
      storage: errorStorageAPI
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    const result = await checkPersistentStorage()
    
    expect(result).toBe(false)
  })
})

describe('Last Access Time Tests', () => {
  it('should save and retrieve last access time', () => {
    const beforeSave = new Date()
    
    saveLastAccessTime()
    
    const retrieved = getLastAccessTime()
    const afterSave = new Date()
    
    expect(retrieved).toBeInstanceOf(Date)
    expect(retrieved!.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime())
    expect(retrieved!.getTime()).toBeLessThanOrEqual(afterSave.getTime())
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'nicoranking_last_access',
      expect.any(String)
    )
  })
  
  it('should return null when no last access time is stored', () => {
    const result = getLastAccessTime()
    
    expect(result).toBeNull()
    expect(localStorageMock.getItem).toHaveBeenCalledWith('nicoranking_last_access')
  })
  
  it('should handle invalid date string in localStorage', () => {
    localStorageMock.store['nicoranking_last_access'] = 'invalid-date'
    
    const result = getLastAccessTime()
    
    // Invalid Date オブジェクトではなく null が返される
    expect(result).toBeNull()
  })
  
  it('should calculate days since last access correctly', () => {
    // 3日前の日時を設定
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    localStorageMock.store['nicoranking_last_access'] = threeDaysAgo.toISOString()
    
    const daysSince = getDaysSinceLastAccess()
    
    expect(daysSince).toBe(3)
  })
  
  it('should return null when no last access time exists', () => {
    const daysSince = getDaysSinceLastAccess()
    
    expect(daysSince).toBeNull()
  })
})

describe('Reminder Settings Tests', () => {
  it('should save and retrieve reminder settings', () => {
    const settings: ReminderSettings = {
      enabled: true,
      intervalDays: 3,
      lastReminder: '2023-12-01T00:00:00.000Z'
    }
    
    saveReminderSettings(settings)
    const retrieved = getReminderSettings()
    
    expect(retrieved).toEqual(settings)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'nicoranking_reminder_settings',
      JSON.stringify(settings)
    )
  })
  
  it('should return default settings when none exist', () => {
    const settings = getReminderSettings()
    
    expect(settings).toEqual({
      enabled: true,
      intervalDays: 5,
      lastReminder: null
    })
  })
  
  it('should handle invalid JSON in localStorage', () => {
    localStorageMock.store['nicoranking_reminder_settings'] = 'invalid-json'
    
    const settings = getReminderSettings()
    
    expect(settings).toEqual({
      enabled: true,
      intervalDays: 5,
      lastReminder: null
    })
  })
  
  it('should determine when to show backup reminder - first time', () => {
    // 初回の場合（lastReminder が null）
    const settings: ReminderSettings = {
      enabled: true,
      intervalDays: 5,
      lastReminder: null
    }
    localStorageMock.store['nicoranking_reminder_settings'] = JSON.stringify(settings)
    
    expect(shouldShowBackupReminder()).toBe(true)
  })
  
  it('should determine when to show backup reminder - interval exceeded', () => {
    // 6日前にリマインダーを表示した場合（間隔5日を超過）
    const sixDaysAgo = new Date()
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
    
    const settings: ReminderSettings = {
      enabled: true,
      intervalDays: 5,
      lastReminder: sixDaysAgo.toISOString()
    }
    localStorageMock.store['nicoranking_reminder_settings'] = JSON.stringify(settings)
    
    expect(shouldShowBackupReminder()).toBe(true)
  })
  
  it('should determine when NOT to show backup reminder - within interval', () => {
    // 3日前にリマインダーを表示した場合（間隔5日以内）
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    
    const settings: ReminderSettings = {
      enabled: true,
      intervalDays: 5,
      lastReminder: threeDaysAgo.toISOString()
    }
    localStorageMock.store['nicoranking_reminder_settings'] = JSON.stringify(settings)
    
    expect(shouldShowBackupReminder()).toBe(false)
  })
  
  it('should not show reminder when disabled', () => {
    const settings: ReminderSettings = {
      enabled: false,
      intervalDays: 5,
      lastReminder: null
    }
    localStorageMock.store['nicoranking_reminder_settings'] = JSON.stringify(settings)
    
    expect(shouldShowBackupReminder()).toBe(false)
  })
  
  it('should mark reminder as shown', () => {
    const beforeMark = new Date()
    
    markReminderShown()
    
    const settings = getReminderSettings()
    const afterMark = new Date()
    
    expect(settings.lastReminder).toBeTruthy()
    const reminderDate = new Date(settings.lastReminder!)
    expect(reminderDate.getTime()).toBeGreaterThanOrEqual(beforeMark.getTime())
    expect(reminderDate.getTime()).toBeLessThanOrEqual(afterMark.getTime())
  })
})

describe('Storage Usage Estimation Tests', () => {
  it('should estimate storage usage successfully', async () => {
    const estimate = await estimateStorageUsage()
    
    expect(estimate).toEqual({
      usage: 1024 * 1024,
      quota: 100 * 1024 * 1024,
      percentUsed: 1
    })
    expect(storageAPISuccess.estimate).toHaveBeenCalled()
  })
  
  it('should handle storage estimation API not supported', async () => {
    const navigator = {
      userAgent: '',
      storage: {
        persisted: vi.fn(),
        persist: vi.fn()
        // estimate メソッドなし
      }
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    const estimate = await estimateStorageUsage()
    
    expect(estimate).toBeNull()
  })
  
  it('should handle storage estimation error', async () => {
    // 独立したエラーAPIモックを作成
    const errorStorageAPI = {
      persisted: vi.fn().mockRejectedValue(new Error('Storage API error')),
      persist: vi.fn().mockRejectedValue(new Error('Storage API error')),
      estimate: vi.fn().mockRejectedValue(new Error('Storage API error'))
    }
    
    const navigator = {
      userAgent: '',
      storage: errorStorageAPI
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    const estimate = await estimateStorageUsage()
    
    expect(estimate).toBeNull()
  })
  
  it('should handle zero quota edge case', async () => {
    const customStorageAPI = {
      estimate: vi.fn().mockResolvedValue({
        usage: 1024,
        quota: 0
      })
    }
    
    const navigator = {
      userAgent: '',
      storage: customStorageAPI
    }
    
    Object.defineProperty(global, 'navigator', {
      value: navigator,
      writable: true,
      configurable: true
    })
    
    Object.defineProperty(global, 'window', {
      value: {
        navigator: navigator
      },
      writable: true,
      configurable: true
    })
    
    const estimate = await estimateStorageUsage()
    
    expect(estimate).toEqual({
      usage: 1024,
      quota: 0,
      percentUsed: 0
    })
  })
})