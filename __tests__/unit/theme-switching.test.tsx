import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react'
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

describe('テーマ切り替え機能', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    
    // localStorageに保存されることを確認
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'user-preferences',
      expect.stringContaining('"theme":"dark"')
    )
  })

  it('ThemeProviderがテーマをHTMLに適用する', async () => {
    // localStorageにダークモード設定を保存
    localStorageMock.getItem.mockReturnValueOnce(
      JSON.stringify({
        lastGenre: 'all',
        lastPeriod: '24h',
        theme: 'dark',
        version: 1,
        updatedAt: new Date().toISOString()
      })
    )
    
    render(<ThemeProvider><div>テスト</div></ThemeProvider>)
    
    // useEffectが実行されてdata-theme属性が設定されるのを待つ
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('3つのテーマすべてが選択可能', () => {
    const { result } = renderHook(() => useUserPreferences())
    
    // ライトモード
    act(() => {
      result.current.updatePreferences({ theme: 'light' })
    })
    expect(result.current.preferences.theme).toBe('light')
    
    // ダークモード
    act(() => {
      result.current.updatePreferences({ theme: 'dark' })
    })
    expect(result.current.preferences.theme).toBe('dark')
    
    // ダークブルー
    act(() => {
      result.current.updatePreferences({ theme: 'darkblue' })
    })
    expect(result.current.preferences.theme).toBe('darkblue')
  })
})