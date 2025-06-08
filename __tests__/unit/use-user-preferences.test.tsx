import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
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

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  it('初回読み込み時にデフォルト値を返す', () => {
    localStorageMock.getItem.mockReturnValue(null)

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

  it('localStorageから設定を読み込む', () => {
    const savedPreferences = {
      lastGenre: 'game',
      lastPeriod: 'hour',
      lastTag: 'ゲーム実況',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedPreferences))

    const { result } = renderHook(() => useUserPreferences())

    expect(result.current.preferences.lastGenre).toBe('game')
    expect(result.current.preferences.lastPeriod).toBe('hour')
    expect(result.current.preferences.lastTag).toBe('ゲーム実況')
  })

  it('設定を更新してlocalStorageに保存する', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserPreferences())

    act(() => {
      result.current.updatePreferences({
        lastGenre: 'anime' as RankingGenre,
        lastPeriod: 'hour',
        lastTag: 'アニメ',
      })
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'user-preferences',
      expect.stringContaining('"lastGenre":"anime"')
    )
    expect(result.current.preferences.lastGenre).toBe('anime')
    expect(result.current.preferences.lastTag).toBe('アニメ')
  })

  it('部分的な更新が可能', () => {
    const initialPreferences = {
      lastGenre: 'game',
      lastPeriod: '24h',
      lastTag: 'ゲーム',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(initialPreferences))

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

  it('無効なデータの場合はデフォルト値を使用', () => {
    localStorageMock.getItem.mockReturnValue('invalid json')

    const { result } = renderHook(() => useUserPreferences())

    expect(result.current.preferences.lastGenre).toBe('all')
    expect(result.current.preferences.lastPeriod).toBe('24h')
  })

  it('設定をリセットできる', () => {
    const savedPreferences = {
      lastGenre: 'game',
      lastPeriod: 'hour',
      lastTag: 'ゲーム実況',
      version: 1,
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedPreferences))

    const { result } = renderHook(() => useUserPreferences())

    act(() => {
      result.current.resetPreferences()
    })

    expect(result.current.preferences.lastGenre).toBe('all')
    expect(result.current.preferences.lastPeriod).toBe('24h')
    expect(result.current.preferences.lastTag).toBeUndefined()
  })
})