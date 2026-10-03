// ユーザー検索（名前・紹介文で投稿者を探す）
//
// nvapi /v1/search/user（2026-10-02 実測: ログイン不要、X-Frontend-Id が必要、pageSize は 100 まで、
// 深さは 5,000 件まで、チャンネルは含まれない）。公開ドキュメントの無い API なので、形が変わったら
// 結果を出さずに失敗として扱い、検索画面の他の機能は止めない。
import { shareSearchRequest } from './shared-request'

export type UserSearchSort = 'followers' | 'videos' | 'relevance'

export const USER_SEARCH_SORT_OPTIONS: ReadonlyArray<{
  value: UserSearchSort
  label: string
}> = [
  { value: 'followers', label: 'フォロワーが多い順' },
  { value: 'videos', label: '動画が多い順' },
  { value: 'relevance', label: '関連度順' },
]

export const USER_SEARCH_PAGE_SIZE = 50
/** 上流が返せる深さ（5,000 件）まで */
export const USER_SEARCH_MAX_PAGE = 5000 / USER_SEARCH_PAGE_SIZE
export const USER_SEARCH_MAX_QUERY_LENGTH = 100
const DEFAULT_TIMEOUT_MS = 5000

const SORT_KEYS: Record<UserSearchSort, string> = {
  followers: 'followerCount',
  videos: 'videoCount',
  relevance: '_personalized',
}

const NVAPI_HEADERS: Record<string, string> = {
  'X-Frontend-Id': '6',
  'X-Frontend-Version': '0',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

export interface UserSearchConditions {
  q: string
  sort: UserSearchSort
  page: number
}

export interface SearchUser {
  id: string
  name: string
  iconUrl?: string
  followerCount: number
  videoCount: number
  description: string
}

export interface UserSearchResult {
  items: SearchUser[]
  totalCount: number
}

export function parseUserSearchSort(
  value: string | null | undefined,
): UserSearchSort {
  return value === 'videos' || value === 'relevance' ? value : 'followers'
}

/** 検索語を整える（前後の空白を除き、空白をまとめ、上限で切る） */
export function normalizeUserQuery(raw: string): string {
  return raw
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, USER_SEARCH_MAX_QUERY_LENGTH)
    .trim()
}

/** /api/search/users と検索ページの URL から読む（不正値は既定に寄せる） */
export function parseUserSearchConditions(
  params: URLSearchParams,
): UserSearchConditions {
  const page = Number(params.get('page'))
  return {
    q: normalizeUserQuery(params.get('q') ?? ''),
    sort: parseUserSearchSort(params.get('sort')),
    page:
      Number.isInteger(page) && page >= 1
        ? Math.min(page, USER_SEARCH_MAX_PAGE)
        : 1,
  }
}

/** /api/search/users の問い合わせの正規形（既定値は省き、キーの順を決める） */
export function buildUserSearchQuery(conditions: UserSearchConditions): string {
  const params = new URLSearchParams({ q: conditions.q })
  if (conditions.sort !== 'followers') params.set('sort', conditions.sort)
  if (conditions.page > 1) params.set('page', String(conditions.page))
  return params.toString()
}

export function buildUserSearchUrl(conditions: UserSearchConditions): string {
  const params = new URLSearchParams({
    keyword: conditions.q,
    sortKey: SORT_KEYS[conditions.sort],
    sortOrder: 'desc',
    page: String(conditions.page),
    pageSize: String(USER_SEARCH_PAGE_SIZE),
  })
  return `https://nvapi.nicovideo.jp/v1/search/user?${params.toString()}`
}

interface UserSearchPayload {
  data?: {
    totalCount?: number
    items?: Array<{
      id?: number | string
      nickname?: string
      icons?: { small?: string; large?: string }
      followerCount?: number
      videoCount?: number
      shortDescription?: string
      strippedDescription?: string
    }>
  }
}

const nonNegative = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

/** 応答から一覧を取り出す（想定外の形なら null。項目の欠けた行は捨てる） */
export function parseUserSearchResponse(
  payload: unknown,
): UserSearchResult | null {
  const data = (payload as UserSearchPayload | null)?.data
  if (!data || !Array.isArray(data.items)) return null
  const items: SearchUser[] = []
  for (const item of data.items) {
    const id =
      typeof item?.id === 'number' || typeof item?.id === 'string'
        ? String(item.id)
        : ''
    if (
      !/^[1-9]\d{0,11}$/.test(id) ||
      typeof item.nickname !== 'string' ||
      item.nickname.length === 0
    )
      continue
    const icon = item.icons?.small ?? item.icons?.large
    items.push({
      id,
      name: item.nickname,
      iconUrl:
        typeof icon === 'string' && icon.startsWith('https://')
          ? icon
          : undefined,
      followerCount: nonNegative(item.followerCount),
      videoCount: nonNegative(item.videoCount),
      description: (item.shortDescription || item.strippedDescription || '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 120),
    })
  }
  return { items, totalCount: nonNegative(data.totalCount) }
}

export async function fetchUserSearch(
  conditions: UserSearchConditions,
  options: {
    fetchImpl?: typeof fetch
    signal?: AbortSignal
    timeoutMs?: number
  } = {},
): Promise<UserSearchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = buildUserSearchUrl(conditions)
  return shareSearchRequest(
    fetchImpl,
    `users:${url}`,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.signal,
    async (signal) => {
      const res = await fetchImpl(url, {
        headers: NVAPI_HEADERS,
        cache: 'no-store',
        signal,
      })
      if (!res.ok) throw new Error(`user_search_http_${res.status}`)
      const parsed = parseUserSearchResponse(await res.json())
      if (!parsed) throw new Error('user_search_unexpected_payload')
      return parsed
    },
  )
}

/** 検索ページの URL（履歴・保存にも同じ形で残す）。動画の並び順（sort）と混ざらないよう usort を使う */
export function buildUserPageQuery(conditions: UserSearchConditions): string {
  const params = new URLSearchParams({ type: 'user', q: conditions.q })
  if (conditions.sort !== 'followers') params.set('usort', conditions.sort)
  if (conditions.page > 1) params.set('page', String(conditions.page))
  return params.toString()
}

export function parseUserPageConditions(
  params: URLSearchParams,
): UserSearchConditions {
  const api = new URLSearchParams()
  api.set('q', params.get('q') ?? '')
  api.set('sort', params.get('usort') ?? '')
  api.set('page', params.get('page') ?? '')
  return parseUserSearchConditions(api)
}
