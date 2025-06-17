import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

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

describe('ユーザー設定の完全な永続化テスト', () => {
  beforeEach(() => {
    // cookieとlocalStorageをクリア
    cookieMock._value = ''
    cookieMock.set.mockClear()
    localStorageMock.clear()
    localStorageMock.getItem.mockReturnValue(null)
    vi.clearAllMocks()
  })

  describe('基本的な保存と復元', () => {
    it('ジャンル・期間・タグがすべて保存される', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // 設定を更新
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'other',
          lastPeriod: 'hour',
          lastTag: 'AIのべりすと'
        })
      })
      
      // Cookieに保存されているか確認
      expect(cookieMock.set).toHaveBeenCalled()
      const setCookieCall = cookieMock.set.mock.calls[0][0]
      expect(setCookieCall).toContain('user-preferences=')
      
      // Cookieの値をデコードして確認
      const cookieValue = setCookieCall.match(/user-preferences=([^;]+)/)?.[1]
      if (cookieValue) {
        const stored = JSON.parse(decodeURIComponent(cookieValue))
        expect(stored.lastGenre).toBe('other')
        expect(stored.lastPeriod).toBe('hour')
        expect(stored.lastTag).toBe('AIのべりすと')
      }
    })

    it('保存された設定が次回マウント時に復元される', () => {
      // 最初のフックインスタンス
      const { result: result1 } = renderHook(() => useUserPreferences())
      
      act(() => {
        result1.current.updatePreferences({
          lastGenre: 'game',
          lastPeriod: '24h',
          lastTag: 'ゲーム実況'
        })
      })
      
      // Cookieから値を取得して設定
      const setCookieCall = cookieMock.set.mock.calls[0][0]
      cookieMock._value = setCookieCall
      
      // 新しいフックインスタンス（ページリロードを模擬）
      const { result: result2 } = renderHook(() => useUserPreferences())
      
      expect(result2.current.preferences.lastGenre).toBe('game')
      expect(result2.current.preferences.lastPeriod).toBe('24h')
      expect(result2.current.preferences.lastTag).toBe('ゲーム実況')
    })
  })

  describe('人気タグの保存', () => {
    it('人気タグから選択したタグも通常のタグと同じように保存される', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // 人気タグ「クッキー☆音MADリンク」を選択
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'other',
          lastPeriod: '24h',
          lastTag: 'クッキー☆音MADリンク'
        })
      })
      
      expect(cookieMock.set).toHaveBeenCalled()
      const setCookieCall = cookieMock.set.mock.calls[0][0]
      const cookieValue = setCookieCall.match(/user-preferences=([^;]+)/)?.[1]
      if (cookieValue) {
        const stored = JSON.parse(decodeURIComponent(cookieValue))
        expect(stored.lastTag).toBe('クッキー☆音MADリンク')
      }
    })

    it('タグをクリアした場合はundefinedが保存される', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // まずタグを設定
      act(() => {
        result.current.updatePreferences({
          lastTag: 'MMD艦これ'
        })
      })
      
      // タグをクリア
      act(() => {
        result.current.updatePreferences({
          lastTag: undefined
        })
      })
      
      const lastCall = cookieMock.set.mock.calls[cookieMock.set.mock.calls.length - 1][0]
      const cookieValue = lastCall.match(/user-preferences=([^;]+)/)?.[1]
      if (cookieValue) {
        const stored = JSON.parse(decodeURIComponent(cookieValue))
        expect(stored.lastTag).toBeUndefined()
      }
    })
  })

  describe('部分的な更新', () => {
    it('一部のフィールドのみ更新しても他のフィールドは保持される', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // 初期設定
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'game',
          lastPeriod: 'hour',
          lastTag: 'ゲーム'
        })
      })
      
      // ジャンルのみ更新
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'anime'
        })
      })
      
      expect(result.current.preferences.lastGenre).toBe('anime')
      expect(result.current.preferences.lastPeriod).toBe('hour')
      expect(result.current.preferences.lastTag).toBe('ゲーム')
    })
  })

  describe('リセット機能', () => {
    it('resetPreferencesでデフォルト値に戻る', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // 設定を変更
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'technology',
          lastPeriod: 'hour',
          lastTag: '技術・工作'
        })
      })
      
      // リセット
      act(() => {
        result.current.resetPreferences()
      })
      
      expect(result.current.preferences.lastGenre).toBe('all')
      expect(result.current.preferences.lastPeriod).toBe('24h')
      expect(result.current.preferences.lastTag).toBeUndefined()
    })
  })
})