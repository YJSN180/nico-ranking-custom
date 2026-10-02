import {
  SEARCH_SORT_OPTIONS,
  parseSearchConditions,
} from '@/lib/search/snapshot-search'
import {
  USER_SEARCH_SORT_OPTIONS,
  parseUserPageConditions,
} from '@/lib/search/user-search'

// 最近の検索（端末内の localStorage だけに置く。サーバーへ送らず、ログや Sentry にも載せない）
//
// - 記録するのは検索を実行したときだけ。条件は保存した検索と同じく検索ページの URL クエリ（ページ番号なし）
// - 同じ条件は先頭へ移し、MAX_SEARCH_HISTORY 件を超えた古いものから消す
// - 保存した検索（saved-searches）とは別の保存先。統合バックアップには含めない

export interface SearchHistoryEntry {
  id: string
  /** 検索ページの URL クエリ（先頭の ? とページ番号なし） */
  query: string
  searchedAt: string
}

export interface SearchHistory {
  /** false のあいだは新しく記録しない（残っている履歴は消さない） */
  record: boolean
  entries: SearchHistoryEntry[]
}

export const SEARCH_HISTORY_KEY = 'search-history'
export const SEARCH_HISTORY_VERSION = 1
export const MAX_SEARCH_HISTORY = 30

export const EMPTY_SEARCH_HISTORY: SearchHistory = { record: true, entries: [] }

/** 履歴を保存できなかった。message はそのまま利用者に見せる文言 */
export class SearchHistoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SearchHistoryError'
  }
}

function isEntry(value: unknown): value is SearchHistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['id'] === 'string' &&
    typeof v['query'] === 'string' &&
    v['query'].length > 0 &&
    typeof v['searchedAt'] === 'string'
  )
}

export function loadSearchHistory(): SearchHistory {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (!raw) return EMPTY_SEARCH_HISTORY
    const store: unknown = JSON.parse(raw)
    if (typeof store !== 'object' || store === null) return EMPTY_SEARCH_HISTORY
    const s = store as Record<string, unknown>
    const entries = Array.isArray(s['entries'])
      ? s['entries'].filter(isEntry)
      : []
    return {
      record: s['record'] !== false,
      entries: entries.slice(0, MAX_SEARCH_HISTORY),
    }
  } catch {
    return EMPTY_SEARCH_HISTORY
  }
}

/** 保存する。ブラウザに保存できなければ SearchHistoryError を投げる */
export function persistSearchHistory(history: SearchHistory): void {
  try {
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify({
        version: SEARCH_HISTORY_VERSION,
        record: history.record,
        entries: history.entries.slice(0, MAX_SEARCH_HISTORY),
      }),
    )
  } catch {
    throw new SearchHistoryError(
      '履歴をブラウザに保存できませんでした。保存できる容量を超えたか、このブラウザでは保存が許可されていません。',
    )
  }
}

function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 実行した検索を先頭に記録する。記録しない設定・空の条件ではそのまま返す */
export function recordSearch(
  history: SearchHistory,
  query: string,
  now: Date = new Date(),
): SearchHistory {
  if (!history.record || !query) return history
  const existing = history.entries.find((entry) => entry.query === query)
  const entry: SearchHistoryEntry = {
    id: existing?.id ?? generateId(),
    query,
    searchedAt: now.toISOString(),
  }
  return {
    ...history,
    entries: [entry, ...history.entries.filter((e) => e.query !== query)].slice(
      0,
      MAX_SEARCH_HISTORY,
    ),
  }
}

export function removeSearchHistoryEntry(
  history: SearchHistory,
  id: string,
): SearchHistory {
  return { ...history, entries: history.entries.filter((e) => e.id !== id) }
}

export function clearSearchHistory(history: SearchHistory): SearchHistory {
  return { ...history, entries: [] }
}

export interface SearchQuerySummary {
  /** 一覧の 1 行目: 検索語（無ければタグ条件） */
  title: string
  /** 2 行目: 検索対象・並び順と、詳細条件があること */
  details: string[]
}

const NUMERIC_KEYS = [
  'viewsMin',
  'viewsMax',
  'commentsMin',
  'commentsMax',
  'likesMin',
  'likesMax',
  'mylistsMin',
  'mylistsMax',
  'durationMin',
  'durationMax',
] as const

/** 保存した URL クエリを、一覧に出す短い文にする（URL の読み方は検索ページと同じ） */
export function summarizeSearchQuery(query: string): SearchQuerySummary {
  const params = new URLSearchParams(query)
  const type = params.get('type')
  if (type === 'id')
    return { title: params.get('q') ?? '', details: ['動画ID'] }
  if (type === 'user') {
    const user = parseUserPageConditions(params)
    const sortLabel =
      USER_SEARCH_SORT_OPTIONS.find((o) => o.value === user.sort)?.label ?? ''
    return { title: user.q, details: ['ユーザー検索', sortLabel] }
  }
  const c = parseSearchConditions(params)
  const title =
    c.q ||
    c.tagConditions
      .map((t) => (t.operator === 'NOT' ? `-${t.tag}` : t.tag))
      .join(' ') ||
    'キーワードなし'
  const sortLabel =
    SEARCH_SORT_OPTIONS.find((option) => option.value === c.sort)?.label ?? ''
  const hasDetails =
    c.contentType !== 'all' ||
    c.genres.length > 0 ||
    Boolean(c.dateFrom || c.dateTo) ||
    (c.q !== '' && c.tagConditions.length > 0) ||
    NUMERIC_KEYS.some((key) => c[key] !== undefined)
  return {
    title,
    details: [
      c.targets === 'tag' ? 'タグ検索' : 'キーワード検索',
      sortLabel,
      hasDetails ? '詳細条件あり' : '',
    ].filter(Boolean),
  }
}
