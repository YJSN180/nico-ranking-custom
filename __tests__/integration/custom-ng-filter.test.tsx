import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ClientPage from '@/app/client-page'
import type { RankingData } from '@/types/ranking'

// Next.js navigation モック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => null,
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
    authorId: 'author1',
    authorName: 'テスト投稿者1',
    registeredAt: '2024-01-01T00:00:00.000Z',
  },
  {
    rank: 2,
    id: 'sm87654321',
    title: 'NGワードを含む動画',
    thumbURL: 'https://example.com/thumb2.jpg',
    views: 2000,
    comments: 200,
    mylists: 100,
    likes: 400,
    authorId: 'author2',
    authorName: 'NG投稿者',
    registeredAt: '2024-01-02T00:00:00.000Z',
  },
  {
    rank: 3,
    id: 'sm11111111',
    title: 'テスト動画3',
    thumbURL: 'https://example.com/thumb3.jpg',
    views: 3000,
    comments: 300,
    mylists: 150,
    likes: 600,
    authorId: 'author3',
    authorName: 'テスト投稿者3',
    registeredAt: '2024-01-03T00:00:00.000Z',
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
global.fetch = vi.fn()

describe('カスタムNGフィルタリング統合テスト', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    sessionStorageMock.getItem.mockReset()
    sessionStorageMock.setItem.mockReset()
    vi.clearAllMocks()
  })

  it('カスタムNGリストが設定されていない場合、すべての動画が表示される', async () => {
    // NGリストなし
    localStorageMock.getItem.mockReturnValue(null)

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.getByText('NGワードを含む動画')).toBeInTheDocument()
      expect(screen.getByText('テスト動画3')).toBeInTheDocument()
    })
  })

  it('動画IDでNGフィルタリングされる', async () => {
    // NGリストに動画IDを設定
    const ngList = {
      videoIds: ['sm87654321'],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'user-ng-list') return JSON.stringify(ngList)
      return null
    })

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.queryByText('NGワードを含む動画')).not.toBeInTheDocument()
      expect(screen.getByText('テスト動画3')).toBeInTheDocument()
    })
  })

  it('動画タイトル（部分一致）でNGフィルタリングされる', async () => {
    // NGリストにタイトルの部分一致を設定
    const ngList = {
      videoIds: [],
      videoTitles: { exact: [], partial: ['NGワード'] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'user-ng-list') return JSON.stringify(ngList)
      return null
    })

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.queryByText('NGワードを含む動画')).not.toBeInTheDocument()
      expect(screen.getByText('テスト動画3')).toBeInTheDocument()
    })
  })

  it('投稿者名（完全一致）でNGフィルタリングされる', async () => {
    // NGリストに投稿者名の完全一致を設定
    const ngList = {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: ['NG投稿者'], partial: [] },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'user-ng-list') return JSON.stringify(ngList)
      return null
    })

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.queryByText('NGワードを含む動画')).not.toBeInTheDocument()
      expect(screen.getByText('テスト動画3')).toBeInTheDocument()
    })
  })

  it('複数のNGフィルタが同時に機能する', async () => {
    // 複数のNGフィルタを設定
    const ngList = {
      videoIds: ['sm11111111'],
      videoTitles: { exact: [], partial: ['NGワード'] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 2,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'user-ng-list') return JSON.stringify(ngList)
      return null
    })

    render(
      <ClientPage
        initialData={mockRankingData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.queryByText('NGワードを含む動画')).not.toBeInTheDocument()
      expect(screen.queryByText('テスト動画3')).not.toBeInTheDocument()
    })
  })
})