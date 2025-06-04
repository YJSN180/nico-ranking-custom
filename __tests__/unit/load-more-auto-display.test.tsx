import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ClientPage from '@/app/client-page'
import type { RankingData } from '@/types/ranking'

// useRealtimeStatsのモック
vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (initialData: RankingData) => ({
    items: initialData,
    isLoading: false,
    lastUpdated: null,
  }),
}))

// モックデータ生成関数
function generateMockData(start: number, count: number): RankingData {
  return Array.from({ length: count }, (_, i) => ({
    rank: start + i,
    id: `sm${10000000 + start + i}`,
    title: `テスト動画${start + i}`,
    thumbURL: `https://example.com/thumb${start + i}.jpg`,
    views: (start + i) * 1000,
    comments: (start + i) * 10,
    mylists: (start + i) * 5,
    likes: (start + i) * 20,
    registeredAt: new Date(2024, 0, start + i).toISOString(),
  }))
}

// localStorageのモック
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// sessionStorageのモック
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })

// グローバルfetchのモック
global.fetch = vi.fn()

describe('さらに読み込むボタンの自動表示テスト', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    sessionStorageMock.getItem.mockReset()
    sessionStorageMock.setItem.mockReset()
    vi.clearAllMocks()
    
    // カスタムNGリストが設定されていない状態にする
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('タグ別ランキングで「さらに読み込む」を押すと自動的に新しいデータが表示される', async () => {
    const user = userEvent.setup()
    const initialData = generateMockData(1, 100)
    const secondPageData = generateMockData(101, 100)
    
    // fetch のモック設定
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => secondPageData,
    } as Response)

    render(
      <ClientPage
        initialData={initialData}
        initialGenre="all"
        initialPeriod="24h"
        initialTag="テストタグ"
      />
    )

    // 最初は100件表示されている
    await waitFor(() => {
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.getByText('テスト動画100')).toBeInTheDocument()
      expect(screen.queryByText('テスト動画101')).not.toBeInTheDocument()
    })

    // 「さらに読み込む」ボタンを探してクリック
    const loadMoreButton = screen.getByText('さらに読み込む')
    await user.click(loadMoreButton)

    // APIが呼ばれたことを確認
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('page=2')
      )
    })

    // 新しいデータが自動的に表示される（「もっと見る」ボタンを押さなくても）
    await waitFor(() => {
      expect(screen.getByText('テスト動画101')).toBeInTheDocument()
      expect(screen.getByText('テスト動画200')).toBeInTheDocument()
    }, { timeout: 3000 })

    // 「もっと見る」ボタンが表示されていないことを確認
    expect(screen.queryByText(/もっと見る/)).not.toBeInTheDocument()
  })

  it('通常のランキングでは「もっと見る」ボタンが正常に機能する', async () => {
    const user = userEvent.setup()
    const initialData = generateMockData(1, 200) // 200件のデータ

    render(
      <ClientPage
        initialData={initialData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 最初は100件のみ表示
    await waitFor(() => {
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.getByText('テスト動画100')).toBeInTheDocument()
      expect(screen.queryByText('テスト動画101')).not.toBeInTheDocument()
    })

    // 「もっと見る」ボタンが表示される
    const showMoreButton = screen.getByText(/もっと見る.*100.*200/)
    expect(showMoreButton).toBeInTheDocument()

    // クリックすると追加の100件が表示される
    await user.click(showMoreButton)

    await waitFor(() => {
      expect(screen.getByText('テスト動画101')).toBeInTheDocument()
      expect(screen.getByText('テスト動画200')).toBeInTheDocument()
    })
  })
})