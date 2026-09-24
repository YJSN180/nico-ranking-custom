// 動画検索ページ（SearchClient）の状態と API 呼び出しのテスト。
// next/navigation は URL を外部ストアとして持つモックに置き換え、/api/search 系は合成した応答を返す。
// 動画 ID・投稿者 ID・名前はすべて合成値。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import type { RankingItem } from '@/types/ranking'

// URL（searchParams）を外部ストアとして持つ。router.replace とテストの「戻る・進む」がこれを書き換える
const nav = vi.hoisted(() => {
  let query = ''
  const listeners = new Set<() => void>()
  const setQuery = (next: string): void => {
    query = next
    window.history.replaceState(null, '', next ? `/search?${next}` : '/search')
    listeners.forEach((listener) => listener())
  }
  const router = {
    replace: vi.fn((href: string) => setQuery(href.split('?')[1] ?? '')),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }
  return {
    router,
    setQuery,
    getQuery: (): string => query,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})

vi.mock('next/navigation', async () => {
  const React = await import('react')
  return {
    useRouter: () => nav.router,
    useSearchParams: () => {
      const query = React.useSyncExternalStore(nav.subscribe, nav.getQuery, nav.getQuery)
      return React.useMemo(() => new URLSearchParams(query), [query])
    },
    usePathname: () => '/search',
  }
})

vi.mock('@/components/ranking-item-responsive', async () => {
  const React = await import('react')
  return {
    default: ({ item }: { item: RankingItem }) =>
      React.createElement('div', { 'data-testid': 'result-item', 'data-id': item.id }, `${item.id} ${item.authorName ?? ''}`),
  }
})
vi.mock('@/components/video-context-menu', async () => {
  const React = await import('react')
  return { VideoContextMenu: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }
})
vi.mock('@/contexts/tag-display-context', async () => {
  const React = await import('react')
  return { TagDisplayProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }
})
vi.mock('@/components/tag-toggle-button', () => ({ TagToggleButton: () => null }))
vi.mock('@/components/initial-ranking-skeleton', () => ({ default: () => null }))
vi.mock('@/components/tag-autocomplete-input', async () => {
  const React = await import('react')
  return {
    TagAutocompleteInput: (props: { value: string; onChange: (value: string) => void; placeholder?: string }) =>
      React.createElement('input', { value: props.value, placeholder: props.placeholder, onChange: (e: { target: { value: string } }) => props.onChange(e.target.value) }),
  }
})

import { SearchClient } from '@/app/search/search-client'

type Json = Record<string, unknown>
interface Handlers {
  search: (url: URL) => Json
  owners: (url: URL) => Json
  tags: (url: URL) => Json
}

let handlers: Handlers
const requests: URL[] = []

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost')
  requests.push(url)
  if (url.pathname === '/api/search') return json(handlers.search(url))
  if (url.pathname === '/api/search/owners') return json(handlers.owners(url))
  if (url.pathname === '/api/search/realtime-tags') return json(handlers.tags(url))
  throw new Error(`unexpected fetch: ${url.href}`)
})

/** /api/search の応答。page は要求どおりに返す */
const searchBody = (url: URL, items: Array<Partial<RankingItem> & { id: string }>, extra: Json = {}): Json => ({
  items: items.map((it, i) => ({ rank: i + 1, title: `title ${it.id}`, thumbURL: '', views: 1, ...it })),
  totalCount: 500,
  page: Number(url.searchParams.get('page') ?? 1),
  pageSize: 50,
  excludedCount: 0,
  source: 'snapshot',
  boundary: '2026-09-22T04:00:01+09:00',
  realtimeCount: 0,
  ...extra,
})

const shownIds = (): string[] => screen.queryAllByTestId('result-item').map((el) => el.getAttribute('data-id') ?? '')
const searchRequests = (): URL[] => requests.filter((u) => u.pathname === '/api/search')
const clickNextPage = (): void => {
  fireEvent.click(screen.getAllByRole('button', { name: '次のページへ' })[0])
}

describe('SearchClient', () => {
  beforeEach(() => {
    localStorage.clear()
    requests.length = 0
    fetchMock.mockClear()
    nav.router.replace.mockClear()
    nav.setQuery('')
    handlers = {
      search: (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'user-1001' }]),
      owners: () => ({ users: {}, channels: {}, missing: [], failed: [] }),
      tags: () => ({ tagDetails: {}, failed: [] }),
    }
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  describe('ページ送り（U-a）', () => {
    it('実行済みの条件で送り、編集中の入力は使わない', async () => {
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'edited' } })
      clickNextPage()
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      expect(searchRequests()[1]?.searchParams.get('q')).toBe('x')
      expect(searchRequests()[1]?.searchParams.get('page')).toBe('2')
    })

    it('同じ条件のページ送りでは、直前の応答の境界と新着件数を渡す', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { source: 'merged', realtimeCount: 7 })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      clickNextPage()
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      expect(searchRequests()[1]?.searchParams.get('boundary')).toBe('2026-09-22T04:00:01+09:00')
      expect(searchRequests()[1]?.searchParams.get('rtCount')).toBe('7')
    })

    it('別の条件の 2 ページ目には、前の結果の境界と新着件数を持ち越さない', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { source: 'merged', realtimeCount: 7 })
      localStorage.setItem(
        'saved-searches',
        JSON.stringify({ version: 1, searches: [{ id: 's1', name: '保存した条件', query: 'q=z&sort=-startTime&page=2', createdAt: 't', updatedAt: 't' }] })
      )
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.click(screen.getByRole('button', { name: '保存した条件' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      const other = searchRequests()[1]
      expect(other?.searchParams.get('q')).toBe('z')
      expect(other?.searchParams.get('page')).toBe('2')
      expect(other?.searchParams.has('boundary')).toBe(false)
      expect(other?.searchParams.has('rtCount')).toBe(false)
    })
  })

  describe('URL の変化に合わせる（U-b）', () => {
    it('戻る・進むなどで URL が変わったら、URL の条件で検索し直し、入力欄も戻す', async () => {
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      act(() => nav.setQuery('q=y&sort=-startTime'))
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      expect(searchRequests()[1]?.searchParams.get('q')).toBe('y')
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('y')
      expect(screen.getByLabelText('並び順')).toHaveValue('-startTime')
    })

    it('URL から条件が消えたら（ナビの「検索」など）、結果を消して入力欄を空に戻す', async () => {
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      act(() => nav.setQuery(''))
      await waitFor(() => expect(shownIds()).toEqual([]))
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('')
      expect(screen.getByText('キーワードやタグ、詳細条件を指定して検索してください。')).toBeInTheDocument()
      expect(searchRequests()).toHaveLength(1)
    })

    it('自分で書き換えた URL では検索し直さない', async () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: '検索' }))
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      clickNextPage()
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(searchRequests()).toHaveLength(2)
      expect(nav.getQuery()).toBe('q=x&page=2')
    })

    it('URL で別の条件の 2 ページ目へ移ったときは、前の結果の境界と新着件数を持ち越さない', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { source: 'merged', realtimeCount: 7 })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      act(() => nav.setQuery('q=z&sort=-startTime&page=3'))
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      expect(searchRequests()[1]?.searchParams.get('page')).toBe('3')
      expect(searchRequests()[1]?.searchParams.has('boundary')).toBe(false)
      expect(searchRequests()[1]?.searchParams.has('rtCount')).toBe(false)
    })
  })

  describe('サーバー側の NG を後から当てる（S-f）', () => {
    it('投稿者名の管理者 NG に当たる投稿者（owners の hiddenAuthorIds）の動画を隠す', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001' }, { id: 'sm2', authorId: '1002' }, { id: 'so3', authorId: 'channel/ch3003' }])
      handlers.owners = () => ({
        users: { '1001': { name: 'user-1001' }, '1002': { name: 'user-1002' } },
        channels: { ch3003: { name: 'channel-3003' } },
        missing: [],
        failed: [],
        hiddenAuthorIds: ['1002', 'channel/ch3003'],
      })
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
    })

    it('ロックタグ規則 D に当たる新着（realtime-tags の hiddenIds）を隠す', async () => {
      handlers.search = (url) =>
        searchBody(
          url,
          [
            { id: 'sm9', authorId: '1001', authorName: 'user-1001' },
            { id: 'sm8', authorId: '1001', authorName: 'user-1001' },
            { id: 'sm1', authorId: '1001', authorName: 'user-1001', tags: ['a'] },
          ],
          { source: 'merged', realtimeCount: 2 }
        )
      handlers.tags = () => ({
        tagDetails: { sm9: [{ name: 'x', isLocked: true }], sm8: [{ name: 'y', isLocked: false }] },
        failed: [],
        hiddenIds: ['sm9'],
      })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm8', 'sm1']))
    })
  })
})
