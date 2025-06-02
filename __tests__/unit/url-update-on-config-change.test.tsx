import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ClientPage from '@/app/client-page'
import type { RankingData } from '@/types/ranking'

// Next.js のルーターをモック
const mockPush = vi.fn()
const mockRouter = {
  push: mockPush,
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
}))

// useRealtimeStatsのモック
vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (initialData: RankingData) => ({
    items: initialData,
    isLoading: false,
    lastUpdated: null,
  }),
}))

// モックデータ
const mockRankingData: RankingData = [
  {
    rank: 1,
    id: 'sm12345678',
    title: 'テスト動画1',
    thumbURL: 'https://example.com/thumb1.jpg',
    views: 1000,
    comments: 100,
    mylists: 50,
    likes: 200,
    registeredAt: '2024-01-01T00:00:00.000Z',
  },
]

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
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({ items: mockRankingData, popularTags: [] }),
  } as Response)
)

describe('URL更新テスト', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    sessionStorageMock.getItem.mockReset()
    sessionStorageMock.setItem.mockReset()
    mockPush.mockReset()
    vi.clearAllMocks()
    
    // カスタムNGリストが設定されていない状態にする
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('ジャンルを変更するとURLが更新される', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // ゲームジャンルボタンをクリック
    const gameButton = screen.getByText('ゲーム')
    await user.click(gameButton)

    // URLが更新されることを確認
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('?genre=game', { scroll: false })
    })
  })

  it('期間を変更するとURLが更新される', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 毎時ボタンをクリック
    const hourButton = screen.getByText('毎時')
    await user.click(hourButton)

    // URLが更新されることを確認
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('?period=hour', { scroll: false })
    })
  })

  it('ジャンルと期間を変更するとURLに両方が含まれる', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // ゲームジャンルボタンをクリック
    const gameButton = screen.getByText('ゲーム')
    await user.click(gameButton)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('?genre=game', { scroll: false })
    })

    // 毎時ボタンをクリック
    const hourButton = screen.getByText('毎時')
    await user.click(hourButton)

    // URLに両方のパラメータが含まれることを確認
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('?genre=game&period=hour', { scroll: false })
    })
  })

  it('デフォルト値に戻すとURLパラメータが削除される', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="game"
        initialPeriod="hour"
      />
    )

    // 総合ジャンルボタンをクリック（デフォルト）
    const allButton = screen.getByText('総合')
    await user.click(allButton)

    // URLから genre が削除されることを確認
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('?period=hour', { scroll: false })
    })
  })
})