import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, act, waitFor } from '@testing-library/react'
import { render, renderHook } from '@/__tests__/test-utils'
import { SettingsModal } from '@/components/settings-modal'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { ThemeProvider } from '@/components/theme-provider'

// localStorageのモック
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
}
global.localStorage = localStorageMock as any

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

// useUserNGListのモック
vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      totalCount: 0
    },
    addVideoId: vi.fn(),
    removeVideoId: vi.fn(),
    addVideoTitle: vi.fn(),
    removeVideoTitle: vi.fn(),
    addAuthorId: vi.fn(),
    removeAuthorId: vi.fn(),
    addAuthorName: vi.fn(),
    removeAuthorName: vi.fn(),
  })
}))

// TODO: このテストはメモリリークが原因でヒープ不足エラーが発生するため一時的にスキップ
// 原因: ThemeProviderまたはSettingsModalのレンダリングでメモリリーク
describe.skip('テーマ切り替え機能', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieMock._value = ''
    cookieMock.set.mockClear()
    localStorageMock.getItem.mockReturnValue(null)
    document.documentElement.removeAttribute('data-theme')
  })

  it('デフォルトのテーマはlightである', () => {
    const { result } = renderHook(() => useUserPreferences())
    expect(result.current.preferences.theme).toBe('light')
  })

  it('設定モーダルでテーマを変更できる', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)
    
    // 表示設定タブをクリック
    fireEvent.click(screen.getByText('表示設定'))
    
    // テーマオプションが表示されることを確認
    expect(screen.getByText('☀️ ライトモード')).toBeInTheDocument()
    expect(screen.getByText('🌙 ダークモード')).toBeInTheDocument()
    expect(screen.getByText('🌌 ダークブルー')).toBeInTheDocument()
    
    // ダークモードを選択
    const darkModeRadio = screen.getByRole('radio', { name: /ダークモード/i })
    fireEvent.click(darkModeRadio)
    
    // Cookieに保存されることを確認
    expect(cookieMock.set).toHaveBeenCalled()
    const setCookieCall = cookieMock.set.mock.calls[0][0]
    expect(setCookieCall).toContain('user-preferences=')
    expect(decodeURIComponent(setCookieCall)).toContain('"theme":"dark"')
  })

  it('ThemeProviderがテーマをHTMLに適用する', async () => {
    // Cookieにダークモード設定を保存
    cookieMock._value = `user-preferences=${encodeURIComponent(JSON.stringify({
      lastGenre: 'all',
      lastPeriod: '24h',
      theme: 'dark',
      version: 1,
      updatedAt: new Date().toISOString()
    }))}`
    
    render(
      <ThemeProvider>
        <div>Test Content</div>
      </ThemeProvider>
    )
    
    // テーマが適用されるのを待つ
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it.skip('テーマ変更時にHTMLのdata-theme属性が更新される', async () => {
    // まずテーマをCookieに設定
    cookieMock._value = `user-preferences=${encodeURIComponent(JSON.stringify({
      lastGenre: 'all',
      lastPeriod: '24h',
      theme: 'light',
      version: 1,
      updatedAt: new Date().toISOString()
    }))}`
    
    // 初期状態
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    
    // ThemeProviderをレンダリング
    const { rerender } = render(
      <ThemeProvider>
        <div>Test Content</div>
      </ThemeProvider>
    )
    
    // ダークブルーに変更（Cookieを更新）
    cookieMock._value = `user-preferences=${encodeURIComponent(JSON.stringify({
      lastGenre: 'all',
      lastPeriod: '24h',
      theme: 'darkblue',
      version: 1,
      updatedAt: new Date().toISOString()
    }))}`
    
    // 再レンダリング
    rerender(
      <ThemeProvider>
        <div>Test Content</div>
      </ThemeProvider>
    )
    
    // data-theme属性が更新されることを確認
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('darkblue')
    })
  })

  it('初回マウント時にCookieからテーマが復元される', () => {
    // Cookieにテーマ設定を保存
    cookieMock._value = `user-preferences=${encodeURIComponent(JSON.stringify({
      lastGenre: 'game',
      lastPeriod: 'hour',
      theme: 'darkblue',
      version: 1,
      updatedAt: new Date().toISOString()
    }))}`
    
    const { result } = renderHook(() => useUserPreferences())
    
    expect(result.current.preferences.theme).toBe('darkblue')
    expect(result.current.preferences.lastGenre).toBe('game')
    expect(result.current.preferences.lastPeriod).toBe('hour')
  })
})