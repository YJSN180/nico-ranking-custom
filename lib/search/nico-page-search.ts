// 本家 www.nicovideo.jp の検索ページ / タグページに埋め込まれた server-response（JSON）から新着動画を読む。
// nvapi /v2/search/video の索引より反映が早く、投稿から数分の動画まで載る（2026-09-22 実測。
// RSS は廃止済みで HTML が返る）。項目の形は nvapi の検索応答と同じ（$getSearchVideoV2）。
// Next.js（/api/search）と Cloudflare Worker（lqng-poller）の両方から使うため、
// fetch / 正規表現 / JSON だけで書き、パスエイリアス（@/）は使わない。

export const NICO_PAGE_SIZE = 32
const NICO_SEARCH_BASE = 'https://www.nicovideo.jp'
const DEFAULT_TIMEOUT_MS = 6000

const PAGE_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'ja,en;q=0.9',
}

/** 埋め込み JSON の動画 1 件（nvapi の NvapiVideo と同形。必要な項目だけ型にする） */
export interface NicoPageVideo {
  id: string
  title: string
  registeredAt: string
  duration?: number
  thumbnail?: { url?: string; listingUrl?: string; middleUrl?: string; largeUrl?: string }
  count?: { view?: number; comment?: number; mylist?: number; like?: number }
  owner?: { id?: string | number | null; name?: string | null; iconUrl?: string | null; ownerType?: string; visibility?: string } | null
  isChannelVideo?: boolean
  requireSensitiveMasking?: boolean
}

export interface NicoPageResult {
  items: NicoPageVideo[]
  totalCount: number
  hasNext: boolean
}

export type NicoPageKind = 'keyword' | 'tag'

export class NicoPageParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NicoPageParseError'
  }
}

/** 投稿日時が新しい順のページ URL。複数タグは空白区切りで AND */
export function buildNicoSearchPageUrl(kind: NicoPageKind, query: string, page = 1): string {
  const path = kind === 'tag' ? 'tag' : 'search'
  const params = new URLSearchParams({ sort: 'f', order: 'd' })
  if (page > 1) params.set('page', String(page))
  return `${NICO_SEARCH_BASE}/${path}/${encodeURIComponent(query.trim())}?${params.toString()}`
}

// 属性値の実体参照を 1 パスで復号する（&amp; を先に戻す逐次 replace は二重復号になる）
const ENTITIES = new Map<string, string>([
  ['quot', '"'],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['apos', "'"],
  ['#39', "'"],
  ['#x27', "'"],
  ['#x2F', '/'],
  ['#47', '/'],
])
export function decodeHtmlAttribute(value: string): string {
  return value.replace(/&(quot|amp|lt|gt|apos|#39|#x27|#x2F|#47);/g, (match, name: string) => ENTITIES.get(name) ?? match)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** HTML から server-response の JSON を取り出して検索結果に整形する。構造が違えば NicoPageParseError */
export function parseNicoSearchPage(html: string): NicoPageResult {
  const tag = html.match(/<meta\b[^>]*\bname="server-response"[^>]*>/)?.[0]
  if (!tag) throw new NicoPageParseError('server-response meta not found')
  const content = tag.match(/\bcontent="([^"]*)"/)?.[1]
  if (content === undefined) throw new NicoPageParseError('server-response content not found')
  let payload: unknown
  try {
    payload = JSON.parse(decodeHtmlAttribute(content))
  } catch {
    throw new NicoPageParseError('server-response is not JSON')
  }
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null
  const response = data && isRecord(data.response) ? data.response : null
  const search = response && isRecord(response.$getSearchVideoV2) ? response.$getSearchVideoV2 : null
  const body = search && isRecord(search.data) ? search.data : null
  if (!body || !Array.isArray(body.items)) throw new NicoPageParseError('$getSearchVideoV2.data.items not found')
  const items: NicoPageVideo[] = []
  for (const raw of body.items) {
    if (!isRecord(raw)) continue
    if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.registeredAt !== 'string') continue
    items.push(raw as unknown as NicoPageVideo)
  }
  return {
    items,
    totalCount: typeof body.totalCount === 'number' ? body.totalCount : items.length,
    hasNext: body.hasNext === true,
  }
}

/** 投稿者 ID（ユーザーは数字文字列、チャンネルは channel/chNNN）。不明なら null */
export function nicoPageOwnerId(video: NicoPageVideo): string | null {
  const owner = video.owner ?? null
  if (!owner || owner.id === undefined || owner.id === null) return null
  const raw = String(owner.id)
  const isChannel = video.isChannelVideo === true || owner.ownerType === 'channel'
  if (!isChannel) return raw
  return raw.startsWith('ch') ? `channel/${raw}` : `channel/ch${raw}`
}

export async function fetchNicoSearchPage(
  kind: NicoPageKind,
  query: string,
  page = 1,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<NicoPageResult> {
  const res = await fetchImpl(buildNicoSearchPageUrl(kind, query, page), {
    headers: PAGE_HEADERS,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`nico_page_http_${res.status}`)
  return parseNicoSearchPage(await res.text())
}
