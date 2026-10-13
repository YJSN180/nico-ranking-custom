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
    // 行の⋮メニューの「投稿者名」と同じく、名前が無ければ ID を値にして NG の追加を呼ぶボタンを置く
    default: ({ item, onQuickNGAdd }: { item: RankingItem; onQuickNGAdd?: (video: RankingItem, type: 'author', value: string) => void }) =>
      React.createElement(
        'div',
        { 'data-testid': 'result-item', 'data-id': item.id },
        `${item.id} ${item.authorName ?? ''}`,
        React.createElement(
          'button',
          { type: 'button', onClick: () => onQuickNGAdd?.(item, 'author', item.authorName || item.authorId || '') },
          `author-ng-${item.id}`
        )
      ),
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
    // 本物と同じく、候補を選んでいない Enter は既定の動作（フォームの送信）を止めて onKeyPress に渡す
    TagAutocompleteInput: (props: {
      id?: string
      value: string
      onChange: (value: string) => void
      onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void
      placeholder?: string
      ariaLabel?: string
      completionMode?: string
      actions?: Array<{ key: string; label: string; onSelect: () => void }>
    }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement('input', {
        id: props.id,
        value: props.value,
        'aria-label': props.ariaLabel,
        'data-completion-mode': props.completionMode,
        placeholder: props.placeholder,
        onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          props.onKeyPress?.(e)
        },
      }),
        // 本物は候補の一覧の最後に出す操作（動画IDを表示・ユーザーを探す）
        ...(props.actions ?? []).map((action) =>
          React.createElement('button', { key: action.key, type: 'button', role: 'option', onClick: action.onSelect }, action.label)
        )
      ),
  }
})

import { SearchClient } from '@/app/search/search-client'
import { parseSearchApiQuery } from '@/lib/search/snapshot-search'
import { buildOwnersQuery, sanitizeChannelVideoIds, sanitizeUserIds } from '@/lib/search/owner-info'
import { buildRealtimeTagsQuery, sanitizeVideoIds } from '@/lib/search/realtime-tags'
import { buildVideoLookupQuery, sanitizeLookupIds } from '@/lib/search/video-lookup'
import { buildUserSearchQuery, parseUserSearchConditions } from '@/lib/search/user-search'

type Json = Record<string, unknown>
interface Handlers {
  /** 応答の本文（200）か、状態コードを決めた Response */
  search: (url: URL) => Json | Response
  owners: (url: URL) => Json
  tags: (url: URL) => Json
}

let handlers: Handlers
const requests: URL[] = []
/** サーバーが 400（invalid_params）にする形の問い合わせ。画面は正規形だけを送る */
const nonCanonical: string[] = []

const rawQuery = (url: URL): string => url.search.replace(/^\?/, '')
function checkCanonical(url: URL): void {
  const raw = rawQuery(url)
  const ok =
    url.pathname === '/api/search'
      ? parseSearchApiQuery(url.searchParams, raw) !== null
      : url.pathname === '/api/search/owners'
        ? buildOwnersQuery({ userIds: sanitizeUserIds(url.searchParams.get('users')), channelVideoIds: sanitizeChannelVideoIds(url.searchParams.get('videos')) }) === raw
        : url.pathname === '/api/search/videos'
          ? buildVideoLookupQuery(sanitizeLookupIds(url.searchParams.get('ids'))) === raw
          : url.pathname === '/api/search/users'
            ? buildUserSearchQuery(parseUserSearchConditions(url.searchParams)) === raw
            : buildRealtimeTagsQuery(sanitizeVideoIds(url.searchParams.get('ids'))) === raw
  if (!ok) nonCanonical.push(`${url.pathname}?${raw}`)
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** 設定されている間、/api/search の応答をこの Promise が解けるまで返さない（中断されたら AbortError） */
let searchGate: Promise<void> | null = null
const waitForGate = (signal?: AbortSignal | null): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!searchGate) return resolve()
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    void searchGate.then(() => resolve())
  })

const defaultFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost')
  requests.push(url)
  checkCanonical(url)
  if (url.pathname === '/api/search') {
    await waitForGate(init?.signal)
    const result = handlers.search(url)
    return result instanceof Response ? result : json(result)
  }
  if (url.pathname === '/api/search/owners') return json(handlers.owners(url))
  if (url.pathname === '/api/search/videos') {
    const ids = (url.searchParams.get('ids') ?? '').split(',')
    return json({
      items: ids.filter((id) => id !== 'sm404').map((id, i) => ({ rank: i + 1, id, title: `title ${id}`, thumbURL: '', views: 1, authorId: '1001', authorName: 'user-1001' })),
      hiddenIds: [],
      missing: ids.filter((id) => id === 'sm404'),
      unavailable: [],
      failed: [],
    })
  }
  if (url.pathname === '/api/search/users') {
    return json({
      items: [
        { id: '1001', name: 'name-a', followerCount: 12000, videoCount: 3, description: 'desc-a' },
        { id: '1002', name: 'name-b', followerCount: 5, videoCount: 1, description: '' },
      ],
      totalCount: 2,
      page: Number(url.searchParams.get('page') ?? 1),
      pageSize: 50,
    })
  }
  if (url.pathname === '/api/search/realtime-tags') return json(handlers.tags(url))
  throw new Error(`unexpected fetch: ${url.href}`)
}
const fetchMock = vi.fn(defaultFetch)

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
    nonCanonical.length = 0
    searchGate = null
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
    // どのテストでも、画面が送った問い合わせはサーバーが受け付ける正規形
    expect(nonCanonical).toEqual([])
  })

  it('A案では日付・ジャンル・タグを常設し、編集中の条件を送信まで適用しない', async () => {
    nav.setQuery('q=x')
    render(<SearchClient />)
    await waitFor(() => expect(shownIds()).toEqual(['sm1']))
    expect(screen.getByLabelText('投稿日時（から）').closest('.search-form__advanced')).toHaveAttribute('hidden')
    fireEvent.click(screen.getByRole('button', { name: '詳細条件', exact: true }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'ゲーム', exact: true }))
    fireEvent.click(screen.getByRole('radio', { name: 'ショート', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: '最近7日' }))
    expect(searchRequests()).toHaveLength(1)
    clickNextPage()
    await waitFor(() => expect(searchRequests()).toHaveLength(2))
    expect(searchRequests()[1].searchParams.get('genre')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'この条件で検索' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'この条件で検索' }))
    await waitFor(() => expect(searchRequests()).toHaveLength(3))
    const query = searchRequests()[2].searchParams
    expect(query.get('genre')).toBe('ゲーム')
    expect(query.get('contentType')).toBe('short')
    expect(query.get('sort')).toBeNull()
    expect(query.get('page') ?? '1').toBe('1')
  })

  it('判定後に退会済みだけを隠し、設定解除で再検索せず再表示する', async () => {
    const ng = { version: 2, totalCount: 0, updatedAt: '', videoIds: [], videoTitles: { exact: [], partial: [] }, authorIds: [], authorNames: { exact: [], partial: [] }, hideDeletedAuthors: true }
    localStorage.setItem('user-ng-list', JSON.stringify(ng))
    handlers.search = (url) => searchBody(url, [
      { id: 'sm1', authorId: '1001' }, { id: 'sm2', authorId: '1002' }, { id: 'sm3', authorId: '1003' },
    ])
    handlers.owners = () => ({ users: { '1002': { name: 'live' } }, channels: {}, missing: ['1001'], failed: ['1003'] })
    nav.setQuery('q=x')
    render(<SearchClient />)
    await waitFor(() => expect(shownIds()).toEqual(['sm2', 'sm3']))
    act(() => window.dispatchEvent(new CustomEvent('ngListUpdated', { detail: { ngList: { ...ng, hideDeletedAuthors: false } } })))
    expect(shownIds()).toEqual(['sm1', 'sm2', 'sm3'])
    expect(searchRequests()).toHaveLength(1)
  })

  describe('問い合わせの正規形（S-d）', () => {
    it('入力の順や空白によらず、正規形で検索し、URL も正規形にする', async () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: '  x  ' } })
      if (document.querySelector('.search-form__advanced')?.hasAttribute('hidden')) fireEvent.click(screen.getByRole('button', { name: '詳細条件', exact: true }))
      fireEvent.click(screen.getByRole('button', { name: 'タグ条件を追加' }))
      if (document.querySelector('.search-form__advanced')?.hasAttribute('hidden')) fireEvent.click(screen.getByRole('button', { name: '詳細条件', exact: true }))
      fireEvent.click(screen.getByRole('button', { name: 'タグ条件を追加' }))
      const operators = screen.getAllByLabelText(/タグ条件\dの演算子/)
      fireEvent.change(operators[0] as HTMLElement, { target: { value: 'NOT' } })
      const tagInputs = screen.getAllByPlaceholderText('タグ名（入力で候補表示）')
      fireEvent.change(tagInputs[0] as HTMLElement, { target: { value: 'n1' } })
      fireEvent.change(tagInputs[1] as HTMLElement, { target: { value: 'a1' } })
      fireEvent.click(screen.getByRole('button', { name: '検索' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(rawQuery(searchRequests()[0] as URL)).toBe('q=x&tagAnd=a1&tagNot=n1')
      expect(nav.getQuery()).toBe('q=x&tagAnd=a1&tagNot=n1')
    })

    it('投稿者情報とタグの補完も正規形（ID を昇順）で問い合わせる', async () => {
      handlers.search = (url) =>
        searchBody(url, [{ id: 'sm9', authorId: '1002' }, { id: 'sm8', authorId: '1001' }, { id: 'so7', authorId: 'channel/ch3003' }], {
          source: 'merged',
          realtimeCount: 2,
        })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(requests.filter((u) => u.pathname !== '/api/search')).toHaveLength(3))
      const owners = requests.filter((u) => u.pathname === '/api/search/owners').map(rawQuery).sort()
      expect(owners).toEqual(['users=1001%2C1002', 'videos=so7'])
      expect(requests.filter((u) => u.pathname === '/api/search/realtime-tags').map(rawQuery)).toEqual(['ids=sm8%2Csm9%2Cso7'])
    })
  })

  it('タグと投稿者の補完を合わせて2並列に制限し、1バッチの失敗後も続ける', async () => {
    handlers.search = (url) => searchBody(url, Array.from({ length: 30 }, (_, i) => ({ id: `sm${i + 1}`, authorId: String(i + 1) })), { source: 'merged', realtimeCount: 30 })
    let active = 0, maximum = 0, completed = 0
    let first = true
    fetchMock.mockImplementation(async (input, init) => {
      if (!String(input).includes('/api/search/')) return defaultFetch(input, init)
      active++
      maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--; completed++
      if (first) { first = false; return json({}, 503) }
      return defaultFetch(input, init)
    })
    nav.setQuery('q=x&sort=-startTime')
    render(<SearchClient />)
    await waitFor(() => expect(completed).toBe(5))
    expect(maximum).toBe(2)
    expect(shownIds()).toHaveLength(30)
  })

  describe('並び順の即時適用', () => {
    it('対応済みの選択肢は公式と同じ順序で、検索前は選択だけを保持する', () => {
      render(<SearchClient />)
      const select = screen.getByLabelText('並び順') as HTMLSelectElement
      expect(Array.from(select.options).map(option => option.text)).toEqual([
        '再生数が多い順', '投稿日時が新しい順', 'いいね！数が多い順', 'マイリスト数が多い順',
        'コメントが新しい順', 'コメントが古い順', '再生数が少ない順', 'コメント数が多い順',
        'コメント数が少ない順', 'いいね！数が少ない順', 'マイリスト数が少ない順', '投稿日時が古い順',
        '再生時間が長い順', '再生時間が短い順',
      ])
      fireEvent.change(select, { target: { value: '-startTime' } })
      expect(select).toHaveValue('-startTime')
      expect(searchRequests()).toHaveLength(0)
    })

    it('入力中の条件を保持したまま1ページ目を即時検索し、URLも一度だけ更新する', async () => {
      nav.setQuery('q=x&page=3')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'draft' } })
      fireEvent.click(screen.getByRole('radio', { name: 'ショート', exact: true }))
      fireEvent.change(screen.getByLabelText('並び順'), { target: { value: '-startTime' } })
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      const query = searchRequests()[1].searchParams
      expect(query.get('q')).toBe('x')
      expect(query.get('contentType')).toBeNull()
      expect(query.get('page') ?? '1').toBe('1')
      expect(query.get('sort')).toBe('-startTime')
      expect(query.has('boundary')).toBe(false)
      expect(query.has('rtCount')).toBe(false)
      expect(nav.getQuery()).toBe('q=x&sort=-startTime')
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('draft')
      expect(screen.getByRole('radio', { name: 'ショート', exact: true })).toBeChecked()
      expect(nav.router.replace).toHaveBeenCalledTimes(1)
      clickNextPage()
      await waitFor(() => expect(searchRequests()).toHaveLength(3))
      expect(searchRequests()[2].searchParams.get('sort')).toBe('-startTime')
    })

    it('連続切り替えは古い通信を中断し、遅れて返る応答で最新の結果を上書きしない', async () => {
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      let finishOld!: (response: Response) => void
      let oldSignal: AbortSignal | null | undefined
      fetchMock.mockImplementationOnce((_input, init) => {
        oldSignal = init?.signal
        return new Promise<Response>(resolve => { finishOld = resolve })
      })
      fireEvent.change(screen.getByLabelText('並び順'), { target: { value: '-startTime' } })
      expect(screen.getByLabelText('検索中')).toBeInTheDocument()
      expect(shownIds()).toEqual([])
      handlers.search = url => searchBody(url, [{ id: 'sm2', authorName: 'new' }])
      fireEvent.change(screen.getByLabelText('並び順'), { target: { value: '-likeCounter' } })
      await waitFor(() => expect(shownIds()).toEqual(['sm2']))
      expect(oldSignal?.aborted).toBe(true)
      await act(async () => finishOld(json(searchBody(new URL('http://localhost/api/search'), [{ id: 'sm9' }]))))
      expect(shownIds()).toEqual(['sm2'])
      expect(screen.getByLabelText('並び順')).toHaveValue('-likeCounter')
      expect(nav.getQuery()).toBe('q=x&sort=-likeCounter')
      expect(screen.queryByLabelText('検索中')).not.toBeInTheDocument()
    })
  })

  describe('ページ送り（U-a）', () => {
    it('中間ページへ直接移動し、10ページ移動とURLからの復帰でも条件を保つ', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { totalCount: 250000 })
      nav.setQuery('q=x&sort=-mylistCounter')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'draft' } })
      const inputs = () => screen.getAllByLabelText('移動先のページ番号')
      fireEvent.change(inputs()[0]!, { target: { value: '500' } })
      fireEvent.submit(inputs()[0]!.closest('form')!)
      await waitFor(() => expect(new URLSearchParams(nav.getQuery()).get('page')).toBe('500'))
      expect(searchRequests().at(-1)?.searchParams.get('q')).toBe('x')
      expect(searchRequests().at(-1)?.searchParams.get('sort')).toBe('-mylistCounter')
      await waitFor(() => expect(inputs()[1]).toHaveValue('500'))
      fireEvent.click(screen.getAllByRole('button', { name: '10ページ先' })[0]!)
      await waitFor(() => expect(new URLSearchParams(nav.getQuery()).get('page')).toBe('510'))
      await waitFor(() => expect(inputs()[1]).toHaveValue('510'))
      act(() => nav.setQuery('q=x&sort=-mylistCounter&page=500'))
      await waitFor(() => expect(inputs()[0]).toHaveValue('500'))
      await waitFor(() => expect(inputs()[1]).toHaveValue('500'))
    })

    it('並び順の横で詳細条件を開閉しても、編集中の条件や検索結果は変わらない', async () => {
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'draft' } })
      const toggle = screen.getByRole('button', { name: '詳細条件', exact: true })
      expect(toggle.parentElement).toContainElement(screen.getByLabelText('並び順'))
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByLabelText('投稿日時（から）')).toBeVisible()
      fireEvent.click(toggle)
      expect(screen.getByLabelText('投稿日時（から）')).not.toBeVisible()
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('draft')
      expect(searchRequests()).toHaveLength(1)
    })

    it.each([100000, 100001])('検索後に適用中の行や閲覧上限の説明を挿入しない（%i件）', async (totalCount) => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { totalCount })
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      expect(screen.queryByText(/閲覧できるのは先頭/)).toBeNull()
      expect(screen.queryByLabelText('適用中の検索条件')).toBeNull()
      expect(screen.queryByRole('button', { name: '投稿期間で絞り込む' })).toBeNull()
    })

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
      fireEvent.click(screen.getByRole('button', { name: '履歴・保存' }))
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

    it.each([['sort=-startTime'], ['targets=tag'], ['page=2']])(
      '並び順・検索対象・ページだけの URL（%s）に直接来ても検索する',
      async (query) => {
        nav.setQuery(query)
        render(<SearchClient />)
        await waitFor(() => expect(searchRequests()).toHaveLength(1))
      }
    )

    it('検索の条件を含まない URL（計測用のパラメータなど）では検索しない', async () => {
      nav.setQuery('utm_source=x')
      render(<SearchClient />)
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(searchRequests()).toHaveLength(0)
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

  describe('新着区間の打ち切りと取得失敗の表示（S-b）', () => {
    const notices = (): string[] => Array.from(document.querySelectorAll('.search-results__notice')).map((el) => el.textContent ?? '')

    it('新着を打ち切ったら、欠けうる投稿時刻の範囲を知らせる', async () => {
      handlers.search = (url) =>
        searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], {
          source: 'merged',
          realtimeCount: 300,
          realtimeTruncated: true,
          realtimeGap: { from: '2026-09-22T04:00:01+09:00', to: '2026-09-22T10:05:00+09:00' },
        })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(notices()).toEqual(['新着が多いため、9/22 04:00〜9/22 10:05 に投稿された動画の一部を表示できていません。']))
    })

    it('新着を取得できずに索引だけの結果になったら知らせる', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { source: 'snapshot', realtimeError: 'nvapi_http_503' })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() =>
        expect(notices()).toEqual(['新着動画を取得できなかったため、検索インデックスの時点までの結果を表示しています。時間をおいて再度検索してください。'])
      )
    })

    it('最新の投稿（本家の検索ページ）を取得できなかったら知らせる', async () => {
      handlers.search = (url) =>
        searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { source: 'merged', realtimeCount: 3, freshError: 'nico_page_http_503' })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(notices()).toEqual(['最新の投稿の一部を取得できませんでした。時間をおいて再度検索してください。']))
    })

    it('打ち切りも失敗も無ければ何も表示しない', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { source: 'merged', realtimeCount: 3 })
      nav.setQuery('q=x&sort=-startTime')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      expect(notices()).toEqual([])
    })
  })

  describe('投稿期間と詳細条件の開閉', () => {
    const open = () => fireEvent.click(screen.getByRole('button', { name: '詳細条件', exact: true }))
    const from = () => screen.getByLabelText('投稿日時（から）')
    const to = () => screen.getByLabelText('投稿日時（まで）')

    it('初期状態は閉じ、検索後も閉じるが条件を保持する', async () => {
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      expect(from().closest('.search-form__advanced')).toHaveAttribute('hidden')
      open()
      fireEvent.change(from(), { target: { value: '2026-09-23' } })
      fireEvent.change(to(), { target: { value: '2026-09-23' } })
      fireEvent.click(screen.getByRole('button', { name: 'この条件で検索' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      expect(from().closest('.search-form__advanced')).toHaveAttribute('hidden')
      expect(from()).toHaveValue('2026-09-23')
      expect(to()).toHaveValue('2026-09-23')
      expect(searchRequests()[1].searchParams.get('dateTo')).toBe('2026-09-23T23:59:59+09:00')
    })

    it('逆順の手入力を説明し、閉じて検索しても再展開してAPIを呼ばない', async () => {
      render(<SearchClient />)
      open()
      fireEvent.change(from(), { target: { value: '2026-09-23' } })
      fireEvent.change(to(), { target: { value: '2026-09-22' } })
      expect(from()).toHaveAttribute('max', '2026-09-22')
      expect(to()).toHaveAttribute('min', '2026-09-23')
      expect(screen.getByRole('alert')).toHaveTextContent('開始日は終了日以前')
      open()
      fireEvent.click(screen.getByRole('button', { name: '検索' }))
      await waitFor(() => expect(from().closest('.search-form__advanced')).not.toHaveAttribute('hidden'))
      expect(searchRequests()).toHaveLength(0)
      fireEvent.change(to(), { target: { value: '2026-09-24' } })
      expect(from()).not.toHaveAttribute('aria-invalid')
      fireEvent.click(screen.getByRole('button', { name: '検索' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
    })

    it('逆順のURLからの検索も送らず、修正する欄を開く', async () => {
      nav.setQuery('q=x&dateFrom=2026-09-23&dateTo=2026-09-22')
      render(<SearchClient />)
      await waitFor(() => expect(from().closest('.search-form__advanced')).not.toHaveAttribute('hidden'))
      expect(screen.getByRole('alert')).toHaveTextContent('開始日は終了日以前')
      expect(searchRequests()).toHaveLength(0)
    })

    it.each([
      ['昨日から', '2026-09-29'], ['最近7日', '2026-09-24'], ['最近30日', '2026-09-01'],
    ])('%s はJSTの今日を含む期間で両端を置き換える', (name, start) => {
      vi.setSystemTime(new Date('2026-09-29T16:00:00Z'))
      try {
        render(<SearchClient />)
        open()
        fireEvent.change(from(), { target: { value: '2026-10-23' } })
        fireEvent.change(to(), { target: { value: '2026-09-22' } })
        fireEvent.click(screen.getByRole('button', { name }))
        expect(from()).toHaveValue(start)
        expect(to()).toHaveValue('2026-09-30')
        expect(from()).not.toHaveAttribute('aria-invalid')
        fireEvent.click(screen.getByRole('button', { name: 'クリア', exact: true }))
        expect(from()).toHaveValue('')
        expect(to()).toHaveValue('')
      } finally { vi.useRealTimers() }
    })
  })

  describe('詳細条件の数値欄', () => {
    const details = (): HTMLDetailsElement => document.querySelector('details.search-form__details') as HTMLDetailsElement

    it('閉じた詳細条件の中に不正な値があれば、詳細条件を開いてその欄を見せる（無反応にしない）', async () => {
      render(<SearchClient />)
      expect(details().open).toBe(false)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      fireEvent.change(screen.getByLabelText('再生数の下限'), { target: { value: '-5' } })
      fireEvent.click(screen.getByRole('button', { name: '検索' }))
      await waitFor(() => expect(details().open).toBe(true))
      expect(searchRequests()).toHaveLength(0)
    })

    it('再生時間は小数の分も入れられ、秒にして検索し、条件の表示も小数のまま', async () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      fireEvent.change(screen.getByLabelText('再生時間の下限（分）'), { target: { value: '1.5' } })
      fireEvent.click(screen.getByRole('button', { name: '検索' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(searchRequests()[0]?.searchParams.get('durationMin')).toBe('90')
      expect(screen.getByLabelText('再生時間の下限（分）')).toHaveValue(1.5)
    })

    it('URL の秒は、小数の分に戻して入力欄に入れる', async () => {
      nav.setQuery('q=x&durationMin=100&durationMax=90')
      render(<SearchClient />)
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(screen.getByLabelText('再生時間の下限（分）')).toHaveValue(1.67)
      expect(screen.getByLabelText('再生時間の上限（分）')).toHaveValue(1.5)
      // 1.67 分は 100 秒に戻る（丸めで条件が変わらない）
      expect(searchRequests()[0]?.searchParams.get('durationMin')).toBe('100')
    })
  })

  describe('投稿者名の NG（名前の無い行）', () => {
    const toasts: Array<{ message: string; type: string }> = []
    const onToast = (event: Event): void => {
      toasts.push((event as CustomEvent<{ message: string; type: string }>).detail)
    }
    const registeredNames = (): string[] =>
      (JSON.parse(localStorage.getItem('user-ng-list') ?? '{}') as { authorNames?: { exact?: string[] } }).authorNames?.exact ?? []

    beforeEach(() => {
      toasts.length = 0
      window.addEventListener('app:toast', onToast)
    })
    afterEach(() => {
      window.removeEventListener('app:toast', onToast)
    })

    it('名前の分からない行では、ID を投稿者名として登録せず、投稿者 ID で NG にするよう案内する', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001' }])
      handlers.owners = () => ({ users: {}, channels: {}, missing: [], failed: ['1001'] })
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.click(screen.getByRole('button', { name: 'author-ng-sm1' }))
      expect(registeredNames()).not.toContain('1001')
      expect(toasts).toEqual([{ message: '投稿者名が分からないため、投稿者 ID で NG にしてください。', type: 'error', action: undefined }])
    })

    it('名前の分かる行は、これまでどおり投稿者名で登録する', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'user-1001' }])
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.click(screen.getByRole('button', { name: 'author-ng-sm1' }))
      expect(registeredNames()).toContain('user-1001')
    })
  })

  describe('読み込み中の操作とページを離れたとき', () => {
    const openGate = (): (() => void) => {
      let release: () => void = () => undefined
      searchGate = new Promise<void>((resolve) => {
        release = resolve
      })
      return () => {
        searchGate = null
        release()
      }
    }
    const searchSignals = (): Array<AbortSignal | undefined> =>
      fetchMock.mock.calls
        .filter(([input]) => new URL(String(input), 'http://localhost').pathname === '/api/search')
        .map(([, init]) => init?.signal ?? undefined)

    it('読み込み中でも条件を変えて検索し直せる（前の検索は止める）', async () => {
      const release = openGate()
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: '検索' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'y' } })
      const submit = screen.getByRole('button', { name: '検索中…' })
      expect(submit).toBeEnabled()
      fireEvent.click(submit)
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      expect(searchRequests()[1]?.searchParams.get('q')).toBe('y')
      expect(searchSignals()[0]?.aborted).toBe(true)
      release()
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      expect(nav.getQuery()).toBe('q=y')
    })

    it('タグ欄で Enter を押すと検索する（日本語の変換を確定する Enter では送らない）', async () => {
      render(<SearchClient />)
      if (document.querySelector('.search-form__advanced')?.hasAttribute('hidden')) fireEvent.click(screen.getByRole('button', { name: '詳細条件', exact: true }))
      fireEvent.click(screen.getByRole('button', { name: 'タグ条件を追加' }))
      const tagInput = screen.getByPlaceholderText('タグ名（入力で候補表示）')
      fireEvent.change(tagInput, { target: { value: 't1' } })
      fireEvent.keyDown(tagInput, { key: 'Enter', isComposing: true })
      fireEvent.keyDown(tagInput, { key: 'Enter', keyCode: 229 })
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(searchRequests()).toHaveLength(0)
      fireEvent.keyDown(tagInput, { key: 'Enter' })
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(searchRequests()[0]?.searchParams.getAll('tagAnd')).toEqual(['t1'])
    })

    it('ページを離れたら、検索の問い合わせを止める', async () => {
      openGate()
      nav.setQuery('q=x')
      const { unmount } = render(<SearchClient />)
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      unmount()
      expect(searchSignals()[0]?.aborted).toBe(true)
    })

    it('ページを離れたら、投稿者情報とタグの補完の問い合わせも止める', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm9', authorId: '1002' }], { source: 'merged', realtimeCount: 1 })
      const pendingSignals: Array<AbortSignal | undefined> = []
      const enrichmentGate = new Promise<void>(() => undefined)
      fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = new URL(String(input), 'http://localhost')
        requests.push(url)
        if (url.pathname === '/api/search') return json(handlers.search(url))
        pendingSignals.push(init?.signal ?? undefined)
        await Promise.race([enrichmentGate, new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))])
        return json({})
      })
      try {
        nav.setQuery('q=x&sort=-startTime')
        const { unmount } = render(<SearchClient />)
        await waitFor(() => expect(pendingSignals).toHaveLength(2))
        unmount()
        expect(pendingSignals.every((signal) => signal?.aborted === true)).toBe(true)
      } finally {
        fetchMock.mockReset()
        fetchMock.mockImplementation(defaultFetch)
      }
    })
  })

  describe('保存した検索の保存と削除（失敗を成功にしない）', () => {
    const savedNames = (): string[] =>
      screen
        .queryAllByRole('button', { name: /^保存した検索「.+」を削除$/ })
        .map((el) => (el.getAttribute('aria-label') ?? '').replace(/^保存した検索「(.+)」を削除$/, '$1'))
    const storedCount = (): number => JSON.parse(localStorage.getItem('saved-searches') ?? '{"searches":[]}').searches.length
    const storeSaved = (count: number): void => {
      localStorage.setItem(
        'saved-searches',
        JSON.stringify({
          version: 1,
          searches: Array.from({ length: count }, (_, i) => ({ id: `id${i}`, name: `保存${i}`, query: 'q=x', createdAt: 't', updatedAt: 't' })),
        })
      )
    }
    const saveAs = (name: string): void => {
      fireEvent.click(screen.getByRole('button', { name: '詳細条件', exact: true }))
      fireEvent.click(screen.getByRole('button', { name: 'この条件を保存' }))
      const input = screen.getByRole('textbox', { name: '保存する名前' })
      fireEvent.change(input, { target: { value: name } })
      fireEvent.keyDown(input, { key: 'Enter' })
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('今の条件に名前を付けて、これまでと同じ形式で保存する（検索フォームは送らない）', async () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      saveAs('新しい保存')
      expect(screen.getByRole('status')).toHaveTextContent('「新しい保存」を保存しました。')
      const stored = JSON.parse(localStorage.getItem('saved-searches') ?? 'null')
      expect(stored).toMatchObject({ version: 1, searches: [{ name: '新しい保存', query: 'q=x' }] })
      expect(searchRequests()).toHaveLength(0)
    })

    it('上限（50 件）に達していたら保存せず、そのことを知らせる', async () => {
      storeSaved(50)
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      saveAs('新しい保存')
      expect(screen.getByRole('alert')).toHaveTextContent('保存できる検索条件は 50 件までです。不要なものを削除してから保存してください。')
      expect(savedNames()).toHaveLength(50)
      expect(savedNames()).not.toContain('新しい保存')
      expect(storedCount()).toBe(50)
    })

    it('ブラウザに保存できなければ、保存したことにしない', async () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })
      saveAs('新しい保存')
      expect(screen.getByRole('alert')).toHaveTextContent('ブラウザに保存できませんでした')
      expect(savedNames()).toEqual([])
    })

    it('削除は同じ場所で元に戻せ、削除を保存できなければ一覧から消さずに知らせる', async () => {
      storeSaved(1)
      render(<SearchClient />)
      fireEvent.click(screen.getByRole('button', { name: '履歴・保存' }))
      await waitFor(() => expect(savedNames()).toEqual(['保存0']))
      fireEvent.click(screen.getByRole('button', { name: '保存した検索「保存0」を削除' }))
      expect(savedNames()).toEqual([])
      fireEvent.click(screen.getByRole('button', { name: '元に戻す' }))
      expect(savedNames()).toEqual(['保存0'])
      expect(storedCount()).toBe(1)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })
      fireEvent.click(screen.getByRole('button', { name: '保存した検索「保存0」を削除' }))
      expect(screen.getByRole('alert')).toHaveTextContent('ブラウザに保存できませんでした')
      expect(savedNames()).toEqual(['保存0'])
    })

    it('保存した検索を選ぶと、その条件ですぐ検索する', async () => {
      localStorage.setItem(
        'saved-searches',
        JSON.stringify({ version: 1, searches: [{ id: 's1', name: 'よく使う', query: 'q=z&targets=tag', createdAt: 't', updatedAt: 't' }] })
      )
      render(<SearchClient />)
      fireEvent.click(screen.getByRole('button', { name: '履歴・保存' }))
      fireEvent.click(screen.getByRole('button', { name: 'よく使う' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(searchRequests()[0].searchParams.get('q')).toBe('z')
      expect(searchRequests()[0].searchParams.get('targets')).toBe('tag')
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('z')
      expect(screen.queryByRole('dialog', { name: '履歴・保存' })).toBeNull()
    })
  })

  describe('最近の検索', () => {
    const historyQueries = (): string[] =>
      (JSON.parse(localStorage.getItem('search-history') ?? '{"entries":[]}').entries as Array<{ query: string }>).map((e) => e.query)
    const focusKeyword = (): void => {
      act(() => (screen.getByLabelText('検索キーワード') as HTMLInputElement).focus())
    }

    it('空の検索欄にフォーカスすると履歴・保存を出し、打ち始めると閉じる', () => {
      render(<SearchClient />)
      focusKeyword()
      expect(screen.getByRole('dialog', { name: '履歴・保存' })).toBeInTheDocument()
      expect(screen.getByText('検索した条件がここに残ります。')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      expect(screen.queryByRole('dialog', { name: '履歴・保存' })).toBeNull()
    })

    it('実行した検索だけを記録し、同じ条件は先頭へ移す（ページ送りでは記録しない）', async () => {
      render(<SearchClient />)
      const input = screen.getByLabelText('検索キーワード')
      fireEvent.change(input, { target: { value: 'a' } })
      fireEvent.click(screen.getByRole('button', { name: /^検索/ }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      fireEvent.change(input, { target: { value: 'b' } })
      fireEvent.click(screen.getByRole('button', { name: /^検索/ }))
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      fireEvent.change(input, { target: { value: 'a' } })
      fireEvent.click(screen.getByRole('button', { name: /^検索/ }))
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      expect(historyQueries()).toEqual(['q=a', 'q=b'])
      clickNextPage()
      await waitFor(() => expect(searchRequests()).toHaveLength(4))
      expect(historyQueries()).toEqual(['q=a', 'q=b'])
    })

    it('最近の検索を選ぶと、その条件ですぐ検索し、記録しない設定では残さない', async () => {
      localStorage.setItem(
        'search-history',
        JSON.stringify({ version: 1, record: true, entries: [{ id: 'h1', query: 'q=old&sort=-startTime', searchedAt: new Date().toISOString() }] })
      )
      render(<SearchClient />)
      focusKeyword()
      fireEvent.click(screen.getByRole('button', { name: /^old/ }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(searchRequests()[0].searchParams.get('q')).toBe('old')
      expect(searchRequests()[0].searchParams.get('sort')).toBe('-startTime')
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: '' } })
      focusKeyword()
      fireEvent.click(screen.getByRole('switch', { name: '履歴を残す' }))
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'new' } })
      fireEvent.click(screen.getByRole('button', { name: /^検索/ }))
      await waitFor(() => expect(searchRequests()).toHaveLength(2))
      expect(historyQueries()).toEqual(['q=old&sort=-startTime'])
    })
  })

  describe('条件で入力', () => {
    const switchToBuilder = (): void => {
      fireEvent.click(screen.getByRole('radio', { name: '条件で入力' }))
    }
    const addWord = (label: string, word: string): void => {
      const input = screen.getByLabelText(label)
      fireEvent.change(input, { target: { value: word } })
      fireEvent.keyDown(input, { key: 'Enter' })
    }

    it('3 つの欄に語を入れ、意味を文で示し、検索式（A B OR C -D）で検索する', async () => {
      render(<SearchClient />)
      switchToBuilder()
      expect(screen.queryByLabelText('検索キーワード')).toBeNull()
      addWord('すべて含む語を追加', '初音ミク')
      addWord('いずれかを含む語を追加', '歌ってみた')
      addWord('いずれかを含む語を追加', '演奏してみた')
      addWord('含めない語を追加', '切り抜き')
      expect(screen.getByText('「初音ミク」を含み、「歌ってみた」か「演奏してみた」のどちらかも含む動画を探します。「切り抜き」を含む動画は除きます。')).toBeInTheDocument()
      expect(searchRequests()).toHaveLength(0)
      // 打ちかけの語も、空でない欄の Enter と同じく送信前に加える
      fireEvent.change(screen.getByLabelText('すべて含む語を追加'), { target: { value: 'VOCALOID' } })
      fireEvent.click(screen.getByRole('button', { name: /^検索/ }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(searchRequests()[0].searchParams.get('q')).toBe('初音ミク VOCALOID 歌ってみた OR 演奏してみた -切り抜き')
    })

    it('通常入力の式を欄に分け、分けられない式は通常入力のまま案内する', () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'A OR B C OR D' } })
      switchToBuilder()
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('A OR B C OR D')
      expect(screen.getByRole('status')).toHaveTextContent('分けられません')
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'A B OR C -D' } })
      switchToBuilder()
      expect(screen.getByRole('button', { name: 'Aを削除' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bを削除' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Dを削除' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: '通常入力' }))
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('A B OR C -D')
    })

    it('前回の入力方法を覚え、URL の式を欄に入れて開く', async () => {
      localStorage.setItem('search-input-mode', 'builder')
      nav.setQuery('q=a+b')
      render(<SearchClient />)
      await waitFor(() => expect(screen.getByRole('button', { name: 'bを削除' })).toBeInTheDocument())
      expect(screen.getByRole('radio', { name: '条件で入力' })).toBeChecked()
    })
  })

  describe('動画IDで開く', () => {
    const lookupRequests = (): URL[] => requests.filter((u) => u.pathname === '/api/search/videos')

    it('ID や URL だけを入れて検索すると、その動画を入力順に開き、見つからない ID の理由を出す', async () => {
      render(<SearchClient />)
      const input = screen.getByLabelText('検索キーワード')
      fireEvent.change(input, { target: { value: 'sm1 https://www.nicovideo.jp/watch/sm404' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(lookupRequests()).toHaveLength(1))
      expect(lookupRequests()[0].searchParams.get('ids')).toBe('sm1,sm404')
      expect(searchRequests()).toHaveLength(0)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      expect(screen.getByText(/見つかりませんでした/)).toHaveTextContent('sm404 は見つかりませんでした。削除されたか、存在しない ID です。')
      expect(input).toHaveValue('sm1 sm404')
      expect(nav.getQuery()).toBe('type=id&q=sm1+sm404')
      // 動画の検索だけの操作（並び順・詳細条件）は出さない
      expect(screen.queryByRole('button', { name: '詳細条件', exact: true })).toBeNull()
    })

    it('候補の「動画を表示」でも開き、「キーワードとして検索」で同じ文字の検索に戻れる', async () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'sm1' } })
      fireEvent.click(screen.getByRole('option', { name: '動画 sm1 を表示' }))
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      fireEvent.click(screen.getByRole('button', { name: 'キーワードとして検索' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(searchRequests()[0].searchParams.get('q')).toBe('sm1')
      expect(screen.getByRole('button', { name: '詳細条件', exact: true })).toBeInTheDocument()
    })

    it('URL（type=id）から開き、最近の検索にも同じ形で残す', async () => {
      nav.setQuery('type=id&q=sm7')
      render(<SearchClient />)
      await waitFor(() => expect(lookupRequests()).toHaveLength(1))
      expect(lookupRequests()[0].searchParams.get('ids')).toBe('sm7')
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'sm8' } })
      fireEvent.keyDown(screen.getByLabelText('検索キーワード'), { key: 'Enter' })
      await waitFor(() => expect(lookupRequests()).toHaveLength(2))
      const history = JSON.parse(localStorage.getItem('search-history') ?? '{}') as { entries: Array<{ query: string }> }
      expect(history.entries[0]?.query).toBe('type=id&q=sm8')
    })
  })

  describe('ユーザーを探す', () => {
    const userRequests = (): URL[] => requests.filter((u) => u.pathname === '/api/search/users')

    it('候補から開き、並び順を変えて取り直し、NG に入れた人はすぐ消える', async () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'ミク' } })
      fireEvent.click(screen.getByRole('option', { name: '「ミク」でユーザーを探す' }))
      await waitFor(() => expect(screen.getByRole('link', { name: 'name-a' })).toBeInTheDocument())
      expect(userRequests()[0].searchParams.get('q')).toBe('ミク')
      expect(nav.getQuery()).toBe('type=user&q=%E3%83%9F%E3%82%AF')
      expect(screen.getByRole('link', { name: 'name-a' })).toHaveAttribute('href', 'https://www.nicovideo.jp/user/1001')
      expect(screen.getAllByText(/フォロワー/, { selector: 'span' })[0]).toHaveTextContent('フォロワー 1.2万 · 動画 3本')
      fireEvent.change(screen.getByLabelText('ユーザーの並び順'), { target: { value: 'videos' } })
      await waitFor(() => expect(userRequests()).toHaveLength(2))
      expect(userRequests()[1].searchParams.get('sort')).toBe('videos')
      fireEvent.click(screen.getByRole('button', { name: 'name-aをNGに追加' }))
      expect(screen.queryByRole('link', { name: 'name-a' })).toBeNull()
      expect(screen.getByRole('link', { name: 'name-b' })).toBeInTheDocument()
    })

    it('ユーザーの結果では Enter でユーザーを探し直し、［動画］で同じ語の動画の検索に戻る', async () => {
      nav.setQuery('type=user&q=a')
      render(<SearchClient />)
      await waitFor(() => expect(userRequests()).toHaveLength(1))
      const input = screen.getByLabelText('検索キーワード')
      fireEvent.change(input, { target: { value: 'b' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(userRequests()).toHaveLength(2))
      expect(userRequests()[1].searchParams.get('q')).toBe('b')
      expect(searchRequests()).toHaveLength(0)
      await waitFor(() => expect(screen.getByRole('radio', { name: '動画' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('radio', { name: '動画' }))
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      expect(searchRequests()[0].searchParams.get('q')).toBe('b')
    })
  })

  describe('クリアの取り消し', () => {
    it('検索欄のクリアは同じ場所で元に戻せ、戻しても検索しない', async () => {
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(searchRequests()).toHaveLength(1))
      fireEvent.click(screen.getByRole('button', { name: '入力を消す' }))
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('')
      fireEvent.click(screen.getByRole('button', { name: '元に戻す' }))
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('x')
      expect(searchRequests()).toHaveLength(1)
    })

    it('クリア後に編集したら、元に戻すは消える', () => {
      render(<SearchClient />)
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: '入力を消す' }))
      fireEvent.change(screen.getByLabelText('検索キーワード'), { target: { value: 'y' } })
      expect(screen.queryByRole('button', { name: '元に戻す' })).toBeNull()
    })

    it('詳細条件のクリアも元に戻せる', () => {
      render(<SearchClient />)
      fireEvent.click(screen.getByRole('button', { name: '詳細条件', exact: true }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'ゲーム', exact: true }))
      fireEvent.click(screen.getByRole('button', { name: '詳細条件をクリア' }))
      expect(screen.getByRole('checkbox', { name: 'ゲーム', exact: true })).not.toBeChecked()
      fireEvent.click(screen.getByRole('button', { name: '元に戻す' }))
      expect(screen.getByRole('checkbox', { name: 'ゲーム', exact: true })).toBeChecked()
    })
  })

  describe('件数の表示', () => {
    it('総数はページ送りだけに表示する（送れるのは索引の上限の 2000 ページまで）', async () => {
      handlers.search = (url) => searchBody(url, [{ id: 'sm1', authorId: '1001', authorName: 'n' }], { totalCount: 250000 })
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(shownIds()).toEqual(['sm1']))
      expect(screen.queryByText(/検索結果 250,000 件/)).toBeNull()
      expect(screen.getAllByText('1〜50件を表示 (全250000件中)')).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'ページ 2000' })).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'ページ 5000' })).toBeNull()
    })
  })

  describe('検索 API のエラーの案内', () => {
    it('条件が不正（search_query_error）なら、条件を見直す案内を出す', async () => {
      handlers.search = () => json({ error: 'search_query_error', detail: 'synthetic parse error' }, 400)
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('検索条件が不正です。条件を見直してください。'))
    })
  })

  describe('受け付けられない問い合わせの案内', () => {
    it('invalid_params（画面とサーバーの版がずれたときなど）なら、再読み込みを案内する', async () => {
      handlers.search = () => json({ error: 'invalid_params' }, 400)
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('検索できませんでした。ページを再読み込みしてから、もう一度お試しください。'))
    })
  })

  describe('検索 API の流量制限の案内', () => {
    it('混み合って断られた（rate_limited）なら、少し待つよう案内する', async () => {
      handlers.search = () => json({ error: 'rate_limited' }, 429)
      nav.setQuery('q=x')
      render(<SearchClient />)
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('アクセスが集中しています。少し待ってから、もう一度お試しください。'))
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
