import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

describe('ユーザー設定の完全な永続化テスト', () => {
  beforeEach(() => {
    // localStorageをクリア
    localStorage.clear()
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
      
      // localStorageに保存されているか確認
      const stored = JSON.parse(localStorage.getItem('user-preferences') || '{}')
      expect(stored.lastGenre).toBe('other')
      expect(stored.lastPeriod).toBe('hour')
      expect(stored.lastTag).toBe('AIのべりすと')
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
      
      // 人気タグ「クッキー☆音MADリンク」を選択した場合
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'other',
          lastPeriod: 'hour',
          lastTag: 'クッキー☆音MADリンク' // 人気タグ
        })
      })
      
      const stored = JSON.parse(localStorage.getItem('user-preferences') || '{}')
      expect(stored.lastTag).toBe('クッキー☆音MADリンク')
    })

    it('タグをクリアした場合はundefinedが保存される', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // まずタグを設定
      act(() => {
        result.current.updatePreferences({
          lastTag: 'AIのべりすと'
        })
      })
      
      // タグをクリア
      act(() => {
        result.current.updatePreferences({
          lastTag: undefined
        })
      })
      
      const stored = JSON.parse(localStorage.getItem('user-preferences') || '{}')
      expect(stored.lastTag).toBeUndefined()
    })
  })

  describe('部分的な更新', () => {
    it('一部のフィールドのみ更新しても他のフィールドは保持される', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // 初期設定
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'entertainment',
          lastPeriod: '24h',
          lastTag: 'バーチャル'
        })
      })
      
      // ジャンルのみ更新
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'technology'
        })
      })
      
      expect(result.current.preferences.lastGenre).toBe('technology')
      expect(result.current.preferences.lastPeriod).toBe('24h')
      expect(result.current.preferences.lastTag).toBe('バーチャル')
    })
  })

  describe('リセット機能', () => {
    it('resetPreferencesでデフォルト値に戻る', () => {
      const { result } = renderHook(() => useUserPreferences())
      
      // カスタム設定
      act(() => {
        result.current.updatePreferences({
          lastGenre: 'anime',
          lastPeriod: 'hour',
          lastTag: 'アニメ'
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