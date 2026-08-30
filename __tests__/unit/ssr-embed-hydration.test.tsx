import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'

// フェーズ2.5-1: SSRが1ページ目のみ埋め込む場合の全件バックグラウンド補完のテスト

// Navigation mock is provided by global setup in vitest.setup.ts

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

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null,
    hasRealtimeData: false
  })
}))

vi.mock('@/hooks/use-video-tags', () => ({
  useVideoTags: (data: any[]) => ({
    items: data,
    isLoading: false
  })
}))

vi.mock('@/lib/request-throttle', () => ({
  requestThrottle: {
    throttle: vi.fn().mockResolvedValue(undefined)
  }
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

vi.mock('@/components/pagination', () => ({
  default: ({ totalPages, onPageChange }: any) => (
    <div data-testid="pagination-mock">
      {Array.from({ length: totalPages }, (_, i) => (
        <button key={i + 1} onClick={() => onPageChange(i + 1)}>
          {`page-${i + 1}`}
        </button>
      ))}
    </div>
  )
}))

const createMockData = (count: number, offset = 0) => {
  return Array.from({ length: count }, (_, i) => ({
    rank: offset + i + 1,
    id: `sm${offset + i + 1}`,
    title: `Test Video ${offset + i + 1}`,
    thumbURL: 'https://example.com/thumb.jpg',
    views: 100000 - (offset + i) * 10,
    comments: 100,
    mylists: 50,
    likes: 10,
    tags: ['tag1'],
    authorId: `user${(offset + i) % 100}`,
    authorName: `Test User ${(offset + i) % 100}`,
    authorIcon: 'https://example.com/icon.jpg'
  }))
}

describe('SSR埋め込み1ページ + 全件バックグラウンド補完', () => {
  const originalFetch = global.fetch
  let fullFetchCalls: string[]

  const installFetchMock = (fullItems: any[], deferred?: { resolve: () => void }) => {
    fullFetchCalls = []
    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || ''
      if (url.includes('/api/ranking/full')) {
        fullFetchCalls.push(url)
        if (deferred) {
          await new Promise<void>((resolve) => {
            deferred.resolve = resolve
          })
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: fullItems, popularTags: [] })
        } as unknown as Response
      }
      // その他のリクエストは他テストの素の環境（相対URLでfetch失敗）に合わせて失敗させる
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // 前のテストの history.replaceState(?page=N) やスクロール保存が漏れないようにリセット
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // 注意: このテストは truncated 系テストより先に置くこと。
  // truncated テストの後にマウント中コンポーネントがアイドル状態になると、
  // jsdom 環境の既存タイマーループが暴走して OOM する相互作用がある
  // （実ブラウザでは発生しない）。壁時計待機もここでは行わない。
  it('initialTotalCount が無い（従来どおり全件埋め込み）場合は補完フェッチしない', async () => {
    const fullData = createMockData(300)
    installFetchMock(fullData)

    render(
      <ClientPage
        initialData={{ items: fullData }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // findByText がレンダリング＋マウント後エフェクトのフラッシュを待つため、
    // 補完エフェクトが発火するならこの時点で記録されている
    expect(await screen.findByText('Test Video 1')).toBeInTheDocument()
    expect(fullFetchCalls).toHaveLength(0)
  })

  it('initialTotalCount が埋め込み件数より多い場合、/api/ranking/full で補完しページ切替できる', async () => {
    const fullData = createMockData(300)
    installFetchMock(fullData)

    render(
      <ClientPage
        initialData={{ items: fullData.slice(0, 100) }}
        initialTotalCount={300}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 1ページ目は埋め込みデータで即表示
    expect(await screen.findByText('Test Video 1')).toBeInTheDocument()
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(100)

    // 補完前からページネーションは総件数ベース（3ページ）で表示される
    expect(await screen.findAllByText('page-3')).not.toHaveLength(0)

    // 補完フェッチが走る
    await waitFor(() => expect(fullFetchCalls.length).toBeGreaterThan(0))

    // 3ページ目に切り替えると補完済みデータが表示される
    fireEvent.click(screen.getAllByText('page-3')[0]!)
    expect(await screen.findByText('Test Video 201')).toBeInTheDocument()
  })

  it('補完完了前に2ページ目へ移動するとローディング表示になり、完了後に表示される', async () => {
    const fullData = createMockData(300)
    const deferred = { resolve: () => {} }
    installFetchMock(fullData, deferred)

    const { container } = render(
      <ClientPage
        initialData={{ items: fullData.slice(0, 100) }}
        initialTotalCount={300}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    expect(await screen.findByText('Test Video 1')).toBeInTheDocument()
    await waitFor(() => expect(fullFetchCalls.length).toBeGreaterThan(0))

    // 補完（未解決のPromise）中に2ページ目へ
    fireEvent.click(screen.getAllByText('page-2')[0]!)

    // 空状態ではなくローディング表示になる
    await waitFor(() => {
      expect(container.querySelector('.loading-container')).not.toBeNull()
    })
    expect(screen.queryByText('ランキングデータがありません')).toBeNull()

    // 補完が完了すると2ページ目が表示される
    deferred.resolve()
    expect(await screen.findByText('Test Video 101')).toBeInTheDocument()
  })

})
