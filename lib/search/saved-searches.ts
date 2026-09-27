// 名前付き検索条件の保存（localStorage）
//
// 互換性の設計:
// - 条件は検索ページのURLクエリ文字列（q=...&tagAnd=...）として保存する。
//   URL⇄フォームの変換層が未知のパラメータを無視・欠損をデフォルト補完するため、
//   将来条件が増減しても古い保存データはそのまま読める
// - ストア自体も version 付きで、統合バックアップには optional セクションとして載る

export interface SavedSearch {
  id: string
  name: string
  /** 検索ページのURLクエリ文字列（先頭の ? なし） */
  query: string
  createdAt: string
  updatedAt: string
}

export interface SavedSearchStore {
  version: number
  searches: SavedSearch[]
}

export const SAVED_SEARCHES_KEY = 'saved-searches'
export const SAVED_SEARCHES_VERSION = 1
export const MAX_SAVED_SEARCHES = 50

/**
 * 保存した検索を保存できなかった（上限・ブラウザの保存領域）。message はそのまま利用者に見せる文言。
 * 呼び出し側（検索画面・統合バックアップの取り込み）は、これを成功として扱わずに知らせる
 */
export class SavedSearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SavedSearchError'
  }
}

function isSavedSearch(value: unknown): value is SavedSearch {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    v['name'].length > 0 &&
    typeof v['query'] === 'string' &&
    typeof v['createdAt'] === 'string' &&
    typeof v['updatedAt'] === 'string'
  )
}

/** 未知の形式でも落ちないよう、有効なエントリだけを取り出す */
export function sanitizeSavedSearches(value: unknown): SavedSearch[] {
  if (typeof value !== 'object' || value === null) return []
  const store = value as Record<string, unknown>
  const searches = store['searches']
  if (!Array.isArray(searches)) return []
  return searches.filter(isSavedSearch).slice(0, MAX_SAVED_SEARCHES)
}

export function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY)
    if (!raw) return []
    return sanitizeSavedSearches(JSON.parse(raw))
  } catch {
    return []
  }
}

/** 保存する。ブラウザに保存できなければ（容量超過・保存の禁止など）SavedSearchError を投げる */
export function persistSavedSearches(searches: SavedSearch[]): void {
  try {
    const store: SavedSearchStore = {
      version: SAVED_SEARCHES_VERSION,
      searches: searches.slice(0, MAX_SAVED_SEARCHES),
    }
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(store))
  } catch {
    throw new SavedSearchError('ブラウザに保存できませんでした。保存できる容量を超えたか、このブラウザでは保存が許可されていません。')
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ss-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 検索条件を保存する。同名の既存エントリは上書き。上限に達していて新しい名前なら SavedSearchError
 * （古いものを黙って消さない）
 * @returns 保存後の一覧
 */
export function addSavedSearch(searches: SavedSearch[], name: string, query: string): SavedSearch[] {
  const trimmedName = name.trim().slice(0, 50)
  if (!trimmedName) return searches
  const now = new Date().toISOString()
  const existing = searches.find((s) => s.name === trimmedName)
  if (!existing && searches.length >= MAX_SAVED_SEARCHES) {
    throw new SavedSearchError(`保存できる検索条件は ${MAX_SAVED_SEARCHES} 件までです。不要なものを削除してから保存してください。`)
  }
  const next = existing
    ? searches.map((s) => (s.name === trimmedName ? { ...s, query, updatedAt: now } : s))
    : [{ id: generateId(), name: trimmedName, query, createdAt: now, updatedAt: now }, ...searches]
  return next.slice(0, MAX_SAVED_SEARCHES)
}

export function removeSavedSearch(searches: SavedSearch[], id: string): SavedSearch[] {
  return searches.filter((s) => s.id !== id)
}

/**
 * バックアップのインポート用マージ。名前が同じものはインポート側で上書き。
 * 合わせると上限を超えるなら、何も取り込まずに SavedSearchError（一部だけ切り捨てて成功と数えない）
 * @returns マージ後の一覧と追加・更新件数
 */
export function mergeSavedSearches(
  existing: SavedSearch[],
  imported: SavedSearch[]
): { merged: SavedSearch[]; importedCount: number } {
  const byName = new Map(existing.map((s) => [s.name, s]))
  let importedCount = 0
  for (const search of imported) {
    if (!isSavedSearch(search)) continue
    byName.set(search.name, { ...search })
    importedCount++
  }
  if (byName.size > MAX_SAVED_SEARCHES) {
    throw new SavedSearchError(
      `保存できる検索条件は ${MAX_SAVED_SEARCHES} 件までです。取り込むと ${byName.size} 件になるため、取り込みませんでした。不要な検索条件を削除してから、もう一度お試しください。`
    )
  }
  return {
    merged: Array.from(byName.values()),
    importedCount,
  }
}
