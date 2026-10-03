import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import { THEME_INIT_SCRIPT } from '@/lib/theme-init-script'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { setUserPreferencesCookieClient } from '@/lib/user-preferences-cookie'

// head のテーマ初期適用スクリプトは、設定の読み込み（useUserPreferences: Cookie → localStorage の順、
// version 1 のみ有効）と同じテーマを塗る前に当てる。食い違うと、ハイドレーション後に
// ThemeProvider がテーマを付け替えて画面がちらつく。
// Safari は JS で書いた Cookie の期限を最長 7 日に縮めるため、Cookie が切れると設定は
// localStorage から Cookie へ戻され、localStorage 側は消える。以後は Cookie だけが残る。

const COOKIE_NAME = 'user-preferences'

function clearPreferenceCookie() {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
}

function preferences(theme: string, version = 1) {
  return { lastGenre: 'all', lastPeriod: '24h', theme, version, updatedAt: '2026-01-01T00:00:00.000Z' }
}

function runInitScript(): string | null {
  new Function(THEME_INIT_SCRIPT)()
  return document.documentElement.getAttribute('data-theme')
}

// ThemeProvider がハイドレーション後に当てるテーマ
function themeAfterHydration(): string {
  const { result } = renderHook(() => useUserPreferences())
  return result.current.preferences.theme || 'light'
}

describe('テーマの初期適用スクリプト', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    clearPreferenceCookie()
    localStorage.clear()
  })

  afterEach(() => {
    clearPreferenceCookie()
    localStorage.clear()
    document.documentElement.setAttribute('data-theme', 'light')
  })

  it('Cookie が切れて localStorage だけ残っているときは localStorage のテーマを当てる', () => {
    localStorage.setItem(COOKIE_NAME, JSON.stringify(preferences('dark')))
    expect(runInitScript()).toBe('dark')
    expect(themeAfterHydration()).toBe('dark')
  })

  it('Cookie から戻したあと（localStorage が消えて Cookie だけ）もテーマを当てる', () => {
    setUserPreferencesCookieClient(preferences('dark'))
    expect(runInitScript()).toBe('dark')
    expect(themeAfterHydration()).toBe('dark')
  })

  it('両方あるときは設定の読み込みと同じく Cookie を優先する', () => {
    setUserPreferencesCookieClient(preferences('darkblue'))
    localStorage.setItem(COOKIE_NAME, JSON.stringify(preferences('dark')))
    expect(runInitScript()).toBe('darkblue')
    expect(themeAfterHydration()).toBe('darkblue')
  })

  it('版の違う保存値は使わない（設定の読み込みも既定の light に戻す）', () => {
    localStorage.setItem(COOKIE_NAME, JSON.stringify(preferences('dark', 0)))
    expect(runInitScript()).toBe('light')
    expect(themeAfterHydration()).toBe('light')
  })

  it('どちらにも無ければ light のまま', () => {
    expect(runInitScript()).toBe('light')
    expect(themeAfterHydration()).toBe('light')
  })

  it('壊れた値でも例外を出さず、もう一方を使う', () => {
    document.cookie = `${COOKIE_NAME}=%7Bbroken; path=/`
    localStorage.setItem(COOKIE_NAME, JSON.stringify(preferences('dark')))
    expect(() => runInitScript()).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('app/layout.tsx の head でこのスクリプトを使う', () => {
    const layout = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf-8')
    expect(layout).toContain('__html: THEME_INIT_SCRIPT')
  })
})
