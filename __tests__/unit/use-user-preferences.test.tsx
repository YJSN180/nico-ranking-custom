import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { renderHook } from '@/__tests__/test-utils'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import type { RankingGenre } from '@/types/ranking-config'

// localStorageのモック
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

// Only define localStorage if it doesn't exist or can be redefined
if (!window.localStorage || Object.getOwnPropertyDescriptor(window, 'localStorage')?.configurable !== false) {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
} else {
  // If can't redefine, replace the methods directly
  Object.assign(window.localStorage, localStorageMock)
}

// document.cookieのモック
const cookieMock = {
  get: vi.fn(() => ''),
  set: vi.fn((value: string) => {
    cookieMock._value = value
  }),
  _value: '',
}

Object.defineProperty(document, 'cookie', {
  get: () => cookieMock._value,
  set: (value: string) => {
    cookieMock.set(value)
    cookieMock._value = value
  },
  configurable: true,
})

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieMock._value = ''
    localStorageMock.clear()
  })

  afterEach(() => {
    localStorageMock.clear()
    cookieMock._value = ''
  })

  it('初回読み込み時にデフォルト値を返す', () => {
    localStorageMock.getItem.mockReturnValue(null)
    cookieMock._value = ''

    const { result } = renderHook(() => useUserPreferences())

    expect(result.current.preferences).toEqual({
      lastGenre: 'all',
      lastPeriod: '24h',
      lastTag: undefined,
      theme: 'light',
      version: 1,
      updatedAt: expect.any(String),
    })
  })

  it('Cookieから設定を読み込む', () => {
    const savedPreferences = {
      lastGenre: 'game',
      lastPeriod: 'hour',
      lastTag: 'ゲーム実況',
      theme: 'dark',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    cookieMock._value = `user-preferences=${encodeURIComponent(JSON.stringify(savedPreferences))}`
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserPreferences())

    expect(result.current.preferences.lastGenre).toBe('game')
    expect(result.current.preferences.lastPeriod).toBe('hour')
    expect(result.current.preferences.lastTag).toBe('ゲーム実況')
    expect(result.current.preferences.theme).toBe('dark')
  })

  it('設定を更新してCookieに保存する', () => {
    localStorageMock.getItem.mockReturnValue(null)
    cookieMock._value = ''

    const { result } = renderHook(() => useUserPreferences())

    act(() => {
      result.current.updatePreferences({
        lastGenre: 'anime' as RankingGenre,
        lastPeriod: 'hour',
        lastTag: 'アニメ',
      })
    })

    // Cookieに保存されることを確認
    expect(cookieMock.set).toHaveBeenCalled()
    const setCookieCall = cookieMock.set.mock.calls[0][0]
    expect(setCookieCall).toContain('user-preferences=')
    expect(decodeURIComponent(setCookieCall)).toContain('"lastGenre":"anime"')
    expect(decodeURIComponent(setCookieCall)).toContain('"lastPeriod":"hour"')
    expect(decodeURIComponent(setCookieCall)).toContain('"lastTag":"アニメ"')
    
    expect(result.current.preferences.lastGenre).toBe('anime')
    expect(result.current.preferences.lastTag).toBe('アニメ')
  })

  it('部分的な更新が可能', () => {
    const initialPreferences = {
      lastGenre: 'game',
      lastPeriod: '24h',
      lastTag: 'ゲーム',
      theme: 'light',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    cookieMock._value = `user-preferences=${encodeURIComponent(JSON.stringify(initialPreferences))}`
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserPreferences())

    act(() => {
      result.current.updatePreferences({
        lastPeriod: 'hour',
      })
    })

    expect(result.current.preferences.lastGenre).toBe('game') // 変更されない
    expect(result.current.preferences.lastPeriod).toBe('hour') // 更新される
    expect(result.current.preferences.lastTag).toBe('ゲーム') // 変更されない
  })

  it('無効なCookieデータの場合はデフォルト値を使用', () => {
    cookieMock._value = 'user-preferences=invalid%20json'
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserPreferences())

    expect(result.current.preferences.lastGenre).toBe('all')
    expect(result.current.preferences.lastPeriod).toBe('24h')
  })

  it('localStorageからCookieへの移行が動作する', () => {
    const savedPreferences = {
      lastGenre: 'game',
      lastPeriod: 'hour',
      lastTag: 'ゲーム実況',
      theme: 'dark',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    
    // localStorageにデータがあり、Cookieは空
    cookieMock._value = ''
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedPreferences))

    const { result } = renderHook(() => useUserPreferences())

    // localStorageからデータが読み込まれる
    expect(result.current.preferences.lastGenre).toBe('game')
    expect(result.current.preferences.lastPeriod).toBe('hour')
    expect(result.current.preferences.lastTag).toBe('ゲーム実況')
    
    // Cookieに移行される
    expect(cookieMock.set).toHaveBeenCalled()
    
    // localStorageから削除される
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('user-preferences')
  })

  it('設定をリセットできる', () => {
    const savedPreferences = {
      lastGenre: 'game',
      lastPeriod: 'hour',
      lastTag: 'ゲーム実況',
      theme: 'dark',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    cookieMock._value = `user-preferences=${encodeURIComponent(JSON.stringify(savedPreferences))}`
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserPreferences())

    act(() => {
      result.current.resetPreferences()
    })

    expect(result.current.preferences.lastGenre).toBe('all')
    expect(result.current.preferences.lastPeriod).toBe('24h')
    expect(result.current.preferences.lastTag).toBeUndefined()
    
    // Cookieに保存されることを確認
    expect(cookieMock.set).toHaveBeenCalled()
  })
})