import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'
import { TOAST_EVENT, type ToastPayload } from '@/lib/toast'

// X-e: SSR は 1 ページ目（100 件）だけを埋め込み、残りは /api/ranking/full で補完する。
// - 2 ページ目以降を開いたら、load 後のアイドルを待たずに全件の取得を始める
// - スクロール位置の復元は、表示するページのデータ（全件）がそろってから行う
// - 全件の取得に失敗したら、黙って 101 位以降を消さず、トーストと再試行を出す

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

// vitest.setup の共通モックは呼ぶたびに新しい関数を返すため、行ごとの MylistButton の effect が
// 毎回走り直して再描画が止まらない（待ち時間の長いテストでメモリを使い切る）。ここでは同じ関数を返す
vi.mock('@/context/mylist-operations-context', () => {
  const operations = {
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }
  return {
    useMylistOperations: () => operations,
    MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
  }
})

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: unknown[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null,
    hasRealtimeData: false
  })
}))

vi.mock('@/hooks/use-video-tags', () => ({
  useVideoTags: (data: unknown[]) => ({
    items: data,
    isLoading: false
  })
}))

// 開発時ログ送信（serverLog）の間隔待ちを外す（ssr-embed-hydration と同じ）
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
  default: ({ totalPages, onPageChange }: { totalPages: number; onPageChange: (page: number) => void }) => (
    <div data-testid="pagination-mock">
      {Array.from({ length: totalPages }, (_, i) => (
        <button key={i + 1} onClick={() => onPageChange(i + 1)}>
          {`page-${i + 1}`}
        </button>
      ))}
    </div>
  )
}))

const createMockData = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    id: `sm${i + 1}`,
    title: `Test Video ${i + 1}`,
    thumbURL: 'https://example.com/thumb.jpg',
    views: 100000 - i * 10,
    comments: 100,
    mylists: 50,
    likes: 10,
    tags: ['合成タグ'],
    authorId: `${9000 + (i % 100)}`,
    authorName: `合成投稿者 ${i % 100}`
  }))

type FullResponse = { ok: boolean; status: number; items?: unknown[] }

describe('2 ページ目以降の全件補完・復元・失敗時の再試行', () => {
  const originalFetch = global.fetch
  let fullFetchCalls: string[]
  let toasts: ToastPayload[]
  const onToast = (event: Event) => toasts.push((event as CustomEvent<ToastPayload>).detail)

  const installFetch = (responses: Array<FullResponse | (() => Promise<FullResponse>)>) => {
    fullFetchCalls = []
    global.fetch = vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : ''
      if (url.includes('/api/ranking/full')) {
        fullFetchCalls.push(url)
        const next = responses.shift() ?? { ok: false, status: 500 }
        const res = typeof next === 'function' ? await next() : next
        return {
          ok: res.ok,
          status: res.status,
          json: async () => ({ items: res.items ?? [], popularTags: [] })
        } as unknown as Response
      }
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
  }

  // load 後のアイドル（requestIdleCallback）は、呼ばれても実行しない（アイドル待ちでないことを確かめる）
  const blockIdle = () => {
    ;(window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = () => 1
    ;(window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback = () => undefined
  }
  const immediateIdle = () => {
    ;(window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = (cb: () => void) => {
      cb()
      return 1
    }
    ;(window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback = () => undefined
  }

  beforeEach(() => {
    vi.clearAllMocks()
    toasts = []
    window.addEventListener(TOAST_EVENT, onToast)
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.removeEventListener(TOAST_EVENT, onToast)
    global.fetch = originalFetch
  })

  it('3 ページ目で開いたら、アイドルを待たずに全件を取得して表示する', async () => {
    blockIdle()
    const full = createMockData(300)
    installFetch([{ ok: true, status: 200, items: full }])
    window.history.replaceState({}, '', '/?page=3')

    render(
      <ClientPage initialData={{ items: full.slice(0, 100) }} initialTotalCount={300} initialGenre="all" initialPeriod="24h" initialPage={3} />
    )

    expect(await screen.findByText('Test Video 201')).toBeInTheDocument()
    expect(fullFetchCalls).toHaveLength(1)
  })

  it('1 ページ目は従来どおりアイドルまで待ち、2 ページ目へ移ったらすぐ取得する', async () => {
    blockIdle()
    const full = createMockData(300)
    installFetch([{ ok: true, status: 200, items: full }])

    render(<ClientPage initialData={{ items: full.slice(0, 100) }} initialTotalCount={300} initialGenre="all" initialPeriod="24h" />)
    expect(await screen.findByText('Test Video 1')).toBeInTheDocument()
    expect(fullFetchCalls).toHaveLength(0)

    fireEvent.click(screen.getAllByText('page-2')[0]!)
    expect(await screen.findByText('Test Video 101')).toBeInTheDocument()
    expect(fullFetchCalls).toHaveLength(1)
  })

  it('スクロール位置の復元は、全件がそろってページが表示されてから行う', async () => {
    blockIdle()
    const full = createMockData(300)
    let release: () => void = () => {}
    installFetch([
      () =>
        new Promise<FullResponse>((resolve) => {
          release = () => resolve({ ok: true, status: 200, items: full })
        })
    ])
    // 同じページ（パス・クエリ）の保存済みスクロール位置
    window.sessionStorage.setItem(
      'navigation-state',
      JSON.stringify({ pathname: '/', searchParams: '', scrollPosition: 4321, timestamp: Date.now() })
    )
    const scrollTo = vi.spyOn(window, 'scrollTo')

    render(
      <ClientPage initialData={{ items: full.slice(0, 100) }} initialTotalCount={300} initialGenre="all" initialPeriod="24h" initialPage={3} />
    )
    await waitFor(() => expect(fullFetchCalls).toHaveLength(1))
    // 全件の取得中（3 ページ目はまだ無い）は復元しない
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(scrollTo).not.toHaveBeenCalledWith(0, 4321)

    release()
    expect(await screen.findByText('Test Video 201')).toBeInTheDocument()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 4321))
  })

  it('全件の取得に失敗したら、再試行付きのトーストを出し、ページ送りを残して 2 ページ目で再試行できる', async () => {
    immediateIdle()
    const full = createMockData(300)
    installFetch([
      { ok: false, status: 500 },
      { ok: true, status: 200, items: full }
    ])

    render(<ClientPage initialData={{ items: full.slice(0, 100) }} initialTotalCount={300} initialGenre="all" initialPeriod="24h" />)
    expect(await screen.findByText('Test Video 1')).toBeInTheDocument()

    await waitFor(() => expect(toasts.some((t) => t.type === 'error' && t.action?.label === '再試行')).toBe(true))
    // 101 位以降が黙って消えない（ページ送りは総件数のまま）
    expect(screen.getAllByText('page-3').length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByText('page-2')[0]!)
    expect(await screen.findByText('101位以降を読み込めませんでした')).toBeInTheDocument()
    expect(screen.queryByText('ランキングデータがありません')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('Test Video 101')).toBeInTheDocument()
    expect(fullFetchCalls).toHaveLength(2)
  })
})
