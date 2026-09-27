import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

// 利用者の設定（テーマ等）の保存を、jsdom の実 Cookie と localStorage で確かめる。データはすべて合成値。

const STORAGE_KEY = 'user-preferences'

function expirePreferenceCookie(): void {
  document.cookie = `${STORAGE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
}

describe('利用者の設定の保存', () => {
  beforeEach(() => {
    localStorage.clear()
    expirePreferenceCookie()
  })

  it('Cookie が無いとき localStorage の控えから戻し、控えは消さない', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lastGenre: 'game', lastPeriod: 'hour', theme: 'dark', version: 1, updatedAt: '2026-01-01T00:00:00.000Z' })
    )

    const first = renderHook(() => useUserPreferences())
    expect(first.result.current.preferences.theme).toBe('dark')
    // app/layout.tsx の描画前スクリプトは localStorage の控えを読んでテーマを当てる
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').theme).toBe('dark')

    // Cookie がまた失効しても（Safari は JS で書いた Cookie を 7 日で失効させる）戻せる
    expirePreferenceCookie()
    const second = renderHook(() => useUserPreferences())
    expect(second.result.current.preferences.theme).toBe('dark')
  })

  describe('画面の複数箇所で使うとき（ページ・設定モーダル・ナビ）', () => {
    it('設定モーダルで変えたテーマが、ページ側のジャンル切り替えで元に戻らない', () => {
      // app/client-page.tsx はページを開いたときの設定を持ったまま、ジャンル切り替えで保存する
      const page = renderHook(() => useUserPreferences())
      const settings = renderHook(() => useUserPreferences())

      act(() => settings.result.current.updatePreferences({ theme: 'dark' }))
      act(() => page.result.current.updatePreferences({ lastGenre: 'game', lastPeriod: '24h', lastTag: undefined }))

      // 再読み込みした状態
      const reloaded = renderHook(() => useUserPreferences())
      expect(reloaded.result.current.preferences.theme).toBe('dark')
      expect(reloaded.result.current.preferences.lastGenre).toBe('game')
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').theme).toBe('dark')
    })

    it('ある箇所で変えたテーマが、開いている他の箇所の表示にも反映される', () => {
      const navigation = renderHook(() => useUserPreferences())
      const settings = renderHook(() => useUserPreferences())

      act(() => settings.result.current.updatePreferences({ theme: 'darkblue' }))

      expect(navigation.result.current.preferences.theme).toBe('darkblue')
    })
  })
})
