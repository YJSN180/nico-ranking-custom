import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
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
})
