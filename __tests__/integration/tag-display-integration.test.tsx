import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockRankingData } from '../test-utils'
import ClientPage from '@/app/client-page'
import type { RankingItem } from '@/types/ranking'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}))

// Mock hooks
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: {
      showTags: true, // デフォルトでtrueに設定
      lastGenre: 'all',
      lastPeriod: '24h',
    },
    updatePreferences: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: [],
    },
  }),
}))

vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({
    visibleGenres: ['all', 'game', 'anime'],
  }),
}))

vi.mock('@/hooks/use-navigation-state', () => ({
  useNavigationState: () => null,
}))

vi.mock('@/hooks/use-ranking-data', () => ({
  useRankingData: () => ({
    rankingData: mockRankingData,
    fullRankingData: mockRankingData,
    currentPopularTags: ['ゲーム', '実況プレイ動画'],
    loading: false,
    error: null,
    fetchRankingData: vi.fn(),
    setCurrentPopularTags: vi.fn(),
    setRankingData: vi.fn(),
    setFullRankingData: vi.fn(),
    setError: vi.fn(),
    abortControllerRef: { current: null },
    tagsAbortControllerRef: { current: null },
    isFallbackInitiatedRef: { current: false },
  }),
}))

// Mock migration function
vi.mock('@/lib/migrate-local-storage', () => ({
  migrateLocalStorageData: vi.fn(),
}))

describe('Tag Display Integration Test', () => {
  const mockDataWithTags: RankingItem[] = [
    {
      rank: 1,
      id: 'sm12345678',
      title: 'タグ付き動画1',
      thumbURL: 'https://example.com/thumb1.jpg',
      views: 1000,
      comments: 100,
      mylists: 50,
      likes: 200,
      tags: ['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ'],
      authorId: 'user123',
      authorName: 'テストユーザー1',
      registeredAt: new Date().toISOString(),
    },
    {
      rank: 2,
      id: 'sm87654321',
      title: 'タグ付き動画2',
      thumbURL: 'https://example.com/thumb2.jpg',
      views: 2000,
      comments: 200,
      mylists: 100,
      likes: 400,
      tags: ['音楽', 'VOCALOID', '初音ミク'],
      authorId: 'user456',
      authorName: 'テストユーザー2',
      registeredAt: new Date().toISOString(),
    },
    {
      rank: 3,
      id: 'so11111111',
      title: '公式動画（タグなし）',
      thumbURL: 'https://example.com/thumb3.jpg',
      views: 3000,
      comments: 300,
      mylists: 150,
      likes: 600,
      tags: [], // 公式チャンネル動画はタグが空
      authorId: 'channel/ch999',
      authorName: '公式チャンネル',
      registeredAt: new Date().toISOString(),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // localStorage のモック
    const localStorageMock: { [key: string]: string } = {}
    global.localStorage = {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, value: string) => {
        localStorageMock[key] = value
      },
      removeItem: (key: string) => {
        delete localStorageMock[key]
      },
      clear: () => {
        Object.keys(localStorageMock).forEach(key => delete localStorageMock[key])
      },
      key: (index: number) => {
        const keys = Object.keys(localStorageMock)
        return keys[index] || null
      },
      length: Object.keys(localStorageMock).length,
    }
  })

  it('should display tags by default when showTags is true', async () => {
    render(
      <ClientPage
        initialData={{ items: mockDataWithTags }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // データが読み込まれるまで待つ
    await waitFor(() => {
      expect(screen.getByText('タグ付き動画1')).toBeInTheDocument()
    })

    // タグが表示されていることを確認
    expect(screen.getByText('ゲーム')).toBeInTheDocument()
    expect(screen.getByText('実況プレイ動画')).toBeInTheDocument()
    expect(screen.getByText('VOICEROID実況プレイ')).toBeInTheDocument()
    expect(screen.getByText('音楽')).toBeInTheDocument()
    expect(screen.getByText('VOCALOID')).toBeInTheDocument()
    expect(screen.getByText('初音ミク')).toBeInTheDocument()
  })

  it('should toggle tag display when clicking the toggle button', async () => {
    const mockUpdatePreferences = vi.fn()
    
    vi.mocked(require('@/hooks/use-user-preferences').useUserPreferences).mockReturnValue({
      preferences: {
        showTags: true,
        lastGenre: 'all',
        lastPeriod: '24h',
      },
      updatePreferences: mockUpdatePreferences,
      resetPreferences: vi.fn(),
    })

    render(
      <ClientPage
        initialData={{ items: mockDataWithTags }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // トグルボタンを探す
    const toggleButton = screen.getByText('🏷️ タグ表示中')
    expect(toggleButton).toBeInTheDocument()

    // ボタンをクリック
    fireEvent.click(toggleButton)

    // updatePreferencesが呼ばれたことを確認
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ showTags: false })
  })

  it('should not display tags for items without tags', async () => {
    render(
      <ClientPage
        initialData={{ items: mockDataWithTags }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // データが読み込まれるまで待つ
    await waitFor(() => {
      expect(screen.getByText('公式動画（タグなし）')).toBeInTheDocument()
    })

    // 公式動画のタグセクションが表示されていないことを確認
    const officialVideoItem = screen.getByText('公式動画（タグなし）').closest('[data-testid="ranking-item"]')
    const tagSections = officialVideoItem?.querySelectorAll('.ranking-item-responsive__tags')
    
    // タグセクションが存在しないか、空であることを確認
    expect(tagSections?.length).toBe(0)
  })

  it('should handle API failures gracefully', async () => {
    // エラー状態をシミュレート
    vi.mocked(require('@/hooks/use-ranking-data').useRankingData).mockReturnValue({
      rankingData: [],
      fullRankingData: [],
      currentPopularTags: [],
      loading: false,
      error: 'ランキングデータの取得に失敗しました',
      fetchRankingData: vi.fn(),
      setCurrentPopularTags: vi.fn(),
      setRankingData: vi.fn(),
      setFullRankingData: vi.fn(),
      setError: vi.fn(),
      abortControllerRef: { current: null },
      tagsAbortControllerRef: { current: null },
      isFallbackInitiatedRef: { current: false },
    })

    render(
      <ClientPage
        initialData={{ items: [] }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // エラーメッセージが表示されることを確認
    expect(screen.getByText(/エラー: ランキングデータの取得に失敗しました/)).toBeInTheDocument()
  })

  it('should persist tag display preference', async () => {
    const mockUpdatePreferences = vi.fn()
    
    vi.mocked(require('@/hooks/use-user-preferences').useUserPreferences).mockReturnValue({
      preferences: {
        showTags: false, // 初期状態はfalse
        lastGenre: 'all',
        lastPeriod: '24h',
      },
      updatePreferences: mockUpdatePreferences,
      resetPreferences: vi.fn(),
    })

    render(
      <ClientPage
        initialData={{ items: mockDataWithTags }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // タグが非表示になっていることを確認
    const toggleButton = screen.getByText('🏷️ タグ非表示')
    expect(toggleButton).toBeInTheDocument()

    // タグが表示されていないことを確認
    expect(screen.queryByText('ゲーム')).not.toBeInTheDocument()
    expect(screen.queryByText('実況プレイ動画')).not.toBeInTheDocument()
  })
})