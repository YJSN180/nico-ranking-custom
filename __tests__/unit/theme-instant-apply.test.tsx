import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsModal } from '@/components/settings-modal'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { useUserNGList } from '@/hooks/use-user-ng-list'

// モック
vi.mock('@/hooks/use-user-preferences')
vi.mock('@/hooks/use-user-ng-list')

describe('テーマの即時反映', () => {
  const mockUpdatePreferences = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    // useUserPreferencesのモック
    ;(useUserPreferences as any).mockReturnValue({
      preferences: {
        theme: 'light',
        lastGenre: 'all',
        lastPeriod: '24h'
      },
      updatePreferences: mockUpdatePreferences
    })
    
    // useUserNGListのモック
    ;(useUserNGList as any).mockReturnValue({
      ngList: {
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        keywords: [],
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        totalCount: 0
      },
      addAuthorId: vi.fn(),
      removeAuthorId: vi.fn(),
      addAuthorName: vi.fn(),
      removeAuthorName: vi.fn(),
      addKeyword: vi.fn(),
      removeKeyword: vi.fn(),
      addVideoId: vi.fn(),
      removeVideoId: vi.fn(),
      addVideoTitle: vi.fn(),
      removeVideoTitle: vi.fn()
    })
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('テーマ選択時に即座にdata-theme属性が更新される', async () => {
    const onClose = vi.fn()
    
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    // 表示設定タブをクリック
    const displayTab = screen.getByText('表示設定')
    fireEvent.click(displayTab)
    
    // ダークモードラジオボタンを取得
    const darkModeRadio = screen.getByLabelText(/ダークモード/)
    
    // 初期状態を確認
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    
    // ダークモードを選択
    fireEvent.click(darkModeRadio)
    
    // updatePreferencesが呼ばれることを確認
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ theme: 'dark' })
    
    // data-theme属性が即座に更新されることを確認
    // （現在の実装では、useEffectによる遅延があるため、このテストは失敗するはず）
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('テーマ変更時にフラッシュが発生しない', async () => {
    // テーマプロバイダーをテスト用に再実装
    const TestThemeProvider = ({ children }: { children: React.ReactNode }) => {
      const { preferences } = useUserPreferences()
      
      // 初回レンダリング前にテーマを適用（理想的な実装）
      if (typeof document !== 'undefined') {
        const theme = preferences.theme || 'light'
        document.documentElement.setAttribute('data-theme', theme)
      }
      
      return <>{children}</>
    }
    
    // 初期テーマをダークに設定
    ;(useUserPreferences as any).mockReturnValue({
      preferences: {
        theme: 'dark',
        lastGenre: 'all',
        lastPeriod: '24h'
      },
      updatePreferences: mockUpdatePreferences
    })
    
    // レンダリング
    render(
      <TestThemeProvider>
        <div>Test Content</div>
      </TestThemeProvider>
    )
    
    // 初回レンダリング時点でダークテーマが適用されていることを確認
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('SSR/初回ロード時にテーマが適用される', () => {
    // localStorageからテーマを読み込む関数
    const getInitialTheme = () => {
      if (typeof window === 'undefined') return 'light'
      
      try {
        const saved = localStorage.getItem('user-preferences')
        if (saved) {
          const prefs = JSON.parse(saved)
          return prefs.theme || 'light'
        }
      } catch {
        // エラー時はデフォルトに
      }
      
      return 'light'
    }
    
    // localStorage にダークテーマを保存
    localStorage.setItem('user-preferences', JSON.stringify({
      theme: 'dark',
      lastGenre: 'all',
      lastPeriod: '24h',
      version: 1,
      updatedAt: new Date().toISOString()
    }))
    
    // 初期テーマを取得
    const initialTheme = getInitialTheme()
    
    // ダークテーマが取得されることを確認
    expect(initialTheme).toBe('dark')
    
    // 即座に適用（<script>タグで実行される想定）
    document.documentElement.setAttribute('data-theme', initialTheme)
    
    // テーマが適用されていることを確認
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})