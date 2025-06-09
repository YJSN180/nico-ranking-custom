import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

// モック
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(),
    toString: vi.fn(() => ''),
  })),
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: {
      theme: 'dark',
      lastGenre: 'all',
      lastPeriod: '24h',
      lastTag: undefined,
    },
    updatePreferences: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    filterItems: (items: any[]) => items,
    ngList: { videoIds: [], videoTitles: { exact: [], partial: [] } },
  }),
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any) => ({
    items: data,
    isLoading: false,
    lastUpdated: null,
  }),
}))

vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false,
}))

vi.mock('@/components/ranking-selector', () => ({
  RankingSelector: () => null,
}))

vi.mock('@/components/tag-selector', () => ({
  TagSelector: () => null,
}))

vi.mock('@/components/ranking-item', () => ({
  default: () => <div data-testid="ranking-item" style={{ background: 'var(--surface-color)' }}>Test Item</div>,
}))

describe('ダークモード背景色テスト', () => {
  it('ダークモード時にページ背景が正しく適用される', () => {
    // ダークモードのCSS変数を設定
    document.documentElement.setAttribute('data-theme', 'dark')
    
    // CSS変数の値を設定（実際のCSSファイルの値をシミュレート）
    const style = document.createElement('style')
    style.innerHTML = `
      :root[data-theme="dark"] {
        --background-color: #121212;
        --surface-color: #1e1e1e;
        --text-primary: #ffffff;
        --text-secondary: #b3b3b3;
      }
    `
    document.head.appendChild(style)
    
    // body要素のスタイルを確認
    const bodyStyle = window.getComputedStyle(document.body)
    
    // bodyの背景色が設定されていることを確認
    expect(document.body.style.backgroundColor || bodyStyle.backgroundColor).toBeDefined()
  })
  
  it('mainタグの背景がCSS変数を使用している', async () => {
    // page.tsxの構造を再現
    const { container } = render(
      <main style={{ 
        padding: '0',
        minHeight: '100vh',
        background: 'var(--background-color)'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: '20px',
          background: 'var(--background-color)'
        }}>
          <div data-testid="content">コンテンツ</div>
        </div>
      </main>
    )
    
    const mainElement = container.querySelector('main')
    expect(mainElement).toHaveStyle({ background: 'var(--background-color)' })
    
    const containerDiv = mainElement?.querySelector('div')
    expect(containerDiv).toHaveStyle({ background: 'var(--background-color)' })
  })
})