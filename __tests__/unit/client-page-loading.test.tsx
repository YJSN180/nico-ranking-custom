import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    updatePreferences: vi.fn(),
    isLoading: false
  })
}))

vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      tags: {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      },
      version: 2,
      totalCount: 0,
      updatedAt: new Date().toISOString()
    },
    saveNGListDirectly: vi.fn()
  })
}))

vi.mock('@/lib/ranking-cache', () => ({
  rankingCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn()
  }
}))

vi.mock('@/components/tag-selector', () => ({
  TagSelector: () => null
}))

const state = vi.hoisted(() => ({ loading: true, error: null as string | null }))
vi.mock('@/hooks/use-ranking-data', () => ({
  useRankingData: ({ initialData }: { initialData: { items: unknown[] } }) => ({
    rankingData: initialData.items, fullRankingData: initialData.items, currentPopularTags: [],
    loading: state.loading, error: state.error, isRetrying: false, retryCount: 0,
    fetchRankingData: vi.fn(), setCurrentPopularTags: vi.fn(), setRankingData: vi.fn(),
    setFullRankingData: vi.fn(), setError: vi.fn(), abortControllerRef: { current: null },
    tagsAbortControllerRef: { current: null }, isFallbackInitiatedRef: { current: false },
  }),
}))

const items = Array.from({ length: 20 }, (_, i) => ({
  rank: i + 1,
  id: `sm${i + 1}`,
  title: `合成タイトル ${i + 1}`,
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1000 - i,
  comments: 10,
  mylists: 5,
  likes: 3,
  tags: ['合成タグ'],
  authorId: `9000${i}`,
  authorName: `合成投稿者 ${i}`
}))

describe('ランキング取得中の表示', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
    window.sessionStorage.clear()
    state.loading = true
    state.error = null
  })

  it('条件変更で取得中は古い結果を出さず、操作可能なセレクターとスケルトンを表示する', () => {
    render(<ClientPage initialData={{ items }} />)
    expect(screen.getByRole('status', { name: 'ランキングを読み込み中' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByTestId('ranking-skeleton-item')).toHaveLength(8)
    expect(screen.queryByText('合成タイトル 1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '総合', exact: true })).toBeEnabled()
  })

  it('取得完了後はスケルトンを外して動画を表示する', () => {
    state.loading = false
    render(<ClientPage initialData={{ items }} />)
    expect(screen.queryByTestId('ranking-skeleton-item')).not.toBeInTheDocument()
    expect(screen.getByText('合成タイトル 1')).toBeInTheDocument()
  })

  it('取得失敗後はスケルトンを残さずエラーを表示する', () => {
    state.loading = false
    state.error = 'データの取得に失敗しました'
    render(<ClientPage initialData={{ items }} />)
    expect(screen.queryByTestId('ranking-skeleton-item')).not.toBeInTheDocument()
    expect(screen.getByText(state.error)).toBeInTheDocument()
  })
})
