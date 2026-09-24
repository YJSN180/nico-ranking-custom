// 動画検索ページ（SearchClient）の状態と API 呼び出しのテスト。
// next/navigation は URL を外部ストアとして持つモックに置き換え、/api/search 系は合成した応答を返す。
// 動画 ID・投稿者 ID・名前はすべて合成値。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
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

describe('SearchClient', () => {
  beforeEach(() => {
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
