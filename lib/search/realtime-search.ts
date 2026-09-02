// リアルタイム検索（検索リアルタイム統合計画 S2）
// Snapshot API のインデックスは毎朝5時時点で止まるため、「直近5:00以降」の区間だけを
// ニコニコ公式フロントが使う nvapi v2 search から取得し、Snapshot結果の先頭にマージする。
// nvapi は非公開APIだが、既存の lib/scraper.ts と同じヘッダーで既に依存している。
import type { RankingItem } from '@/types/ranking'
import type { SearchConditions } from './snapshot-search'

export const NVAPI_SEARCH_URL = 'https://nvapi.nicovideo.jp/v2/search/video'
export const REALTIME_PAGE_SIZE = 100
/** 区間が巨大なときの安全弁（100件×3ページ） */
export const REALTIME_MAX_PAGES = 3
/** Snapshot のインデックス確定時刻（JST） */
export const SNAPSHOT_CUTOFF_HOUR_JST = 5

const NVAPI_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ja,en;q=0.9',
  'X-Frontend-Id': '6',
  'X-Frontend-Version': '0',
  Referer: 'https://www.nicovideo.jp/',
}

// Snapshot のジャンル表記（日本語）→ nvapi の genres キー
export const NVAPI_GENRE_KEYS: Record<string, string> = {
  'アニメ': 'anime',
  'エンターテイメント': 'entertainment',
  'ゲーム': 'game',
  'スポーツ': 'sports',
  'ダンス': 'dance',
  'ラジオ': 'radio',
  '音楽・サウンド': 'music_sound',
  '解説・講座': 'commentary_lecture',
  '技術・工作': 'technology_craft',
  '動物': 'animal',
  '自然': 'nature',
  '社会・政治・時事': 'society_politics_news',
  '乗り物': 'vehicle',
  '旅行・アウトドア': 'traveling_outdoor',
  '料理': 'cooking',
  '例のソレ': 'r18',
  'その他': 'other',
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 境界 T = 直近の 05:00 JST（現在が5時前なら前日5時）。
 * サーバーのタイムゾーンに依存しないよう UTC ミリ秒から JST を計算する。
 */
export function getRealtimeBoundary(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  const y = jst.getUTCFullYear()
  const m = jst.getUTCMonth()
  const d = jst.getUTCDate()
  const boundaryJst = Date.UTC(y, m, d, SNAPSHOT_CUTOFF_HOUR_JST, 0, 0)
  const boundary = jst.getTime() >= boundaryJst ? boundaryJst : boundaryJst - 24 * 60 * 60 * 1000
  const b = new Date(boundary)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())}T${pad(SNAPSHOT_CUTOFF_HOUR_JST)}:00:00+09:00`
}

/**
 * この条件でリアルタイム区間をマージできるか。
 * - ソートが「投稿日時が新しい順」のときだけ（境界とソートキーが一致し、区間を先頭に置ける）
 * - タグの OR / NOT は nvapi 応答にタグが無く後付け判定できないため不可
 * - 投稿日範囲の上限が境界より前なら区間は空なので不要
 */
export function isRealtimeMergeable(conditions: SearchConditions, boundary: string): boolean {
  if (conditions.sort !== '-startTime') return false
  if (conditions.tagConditions.some((c) => c.operator !== 'AND')) return false
  if (conditions.dateTo && new Date(conditions.dateTo).getTime() < new Date(boundary).getTime()) return false
  if (!conditions.q && conditions.tagConditions.length === 0 && conditions.genres.length === 0) return false
  return true
}

export function buildNvapiSearchUrl(conditions: SearchConditions, boundary: string, page: number): string {
  const params = new URLSearchParams()
  const andTags = conditions.tagConditions.filter((c) => c.operator === 'AND').map((c) => c.tag)
  if (conditions.targets === 'tag') {
    if (conditions.q) andTags.unshift(conditions.q)
  } else if (conditions.q) {
    params.set('keyword', conditions.q)
  }
  if (andTags.length > 0) params.set('tag', andTags.join(' '))
  const genres = conditions.genres.map((g) => NVAPI_GENRE_KEYS[g]).filter(Boolean)
  if (genres.length > 0) params.set('genres', genres.join(','))
  params.set('sortKey', 'registeredAt')
  params.set('sortOrder', 'desc')
  params.set('pageSize', String(REALTIME_PAGE_SIZE))
  params.set('page', String(page))
  // 区間の下限は境界と dateFrom の遅い方
  const from =
    conditions.dateFrom && new Date(conditions.dateFrom).getTime() > new Date(boundary).getTime()
      ? conditions.dateFrom
      : boundary
  params.set('minRegisteredAt', from)
  if (conditions.dateTo) params.set('maxRegisteredAt', conditions.dateTo)
  return `${NVAPI_SEARCH_URL}?${params.toString()}`
}

export interface NvapiVideo {
  id: string
  title: string
  registeredAt: string
  duration?: number
  thumbnail?: { url?: string; listingUrl?: string; middleUrl?: string; largeUrl?: string }
  count?: { view?: number; comment?: number; mylist?: number; like?: number }
  owner?: { id?: string | number; name?: string; iconUrl?: string; ownerType?: string }
  isChannelVideo?: boolean
}

export interface NvapiSearchResponse {
  meta: { status: number }
  data?: { totalCount?: number; hasNext?: boolean; items?: NvapiVideo[] }
}

export function mapNvapiVideoToRankingItem(video: NvapiVideo, rank: number): RankingItem {
  const ownerId = video.owner?.id !== undefined && video.owner?.id !== null ? String(video.owner.id) : undefined
  const authorId = ownerId
    ? video.isChannelVideo || video.owner?.ownerType === 'channel'
      ? `channel/ch${ownerId}`
      : ownerId
    : undefined
  return {
    rank,
    id: video.id,
    title: video.title,
    thumbURL: video.thumbnail?.listingUrl ?? video.thumbnail?.url ?? video.thumbnail?.middleUrl ?? '',
    views: video.count?.view ?? 0,
    comments: video.count?.comment ?? 0,
    likes: video.count?.like ?? 0,
    mylists: video.count?.mylist ?? 0,
    duration: video.duration,
    registeredAt: video.registeredAt,
    authorId,
    authorName: video.owner?.name,
    authorIcon: video.owner?.iconUrl,
    // nvapi の応答にタグは含まれない（S4 で補完）
    tags: undefined,
  }
}

const inRange = (value: number, min?: number, max?: number): boolean =>
  (min === undefined || value >= min) && (max === undefined || value <= max)

/** Snapshot の filters と同じ意味論の範囲フィルタを、リアルタイム区間に後付け適用する */
export function applyRealtimeRangeFilters(items: RankingItem[], c: SearchConditions): RankingItem[] {
  return items.filter(
    (it) =>
      inRange(it.views, c.viewsMin, c.viewsMax) &&
      inRange(it.comments ?? 0, c.commentsMin, c.commentsMax) &&
      inRange(it.likes ?? 0, c.likesMin, c.likesMax) &&
      inRange(it.mylists ?? 0, c.mylistsMin, c.mylistsMax) &&
      (it.duration === undefined || inRange(it.duration, c.durationMin, c.durationMax))
  )
}

export interface RealtimeSegment {
  items: RankingItem[]
  /** nvapi が返した区間総数（後付けフィルタ前） */
  upstreamTotal: number
  /** REALTIME_MAX_PAGES で打ち切った場合 true */
  truncated: boolean
}

/**
 * リアルタイム区間を取得する（境界以降・新しい順・後付けフィルタ済み）。
 * 上流エラーは呼び出し側で Snapshot 単独へ縮退させるため throw する。
 */
export async function fetchRealtimeSegment(
  conditions: SearchConditions,
  boundary: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8000
): Promise<RealtimeSegment> {
  const collected: RankingItem[] = []
  let upstreamTotal = 0
  let truncated = false
  for (let page = 1; page <= REALTIME_MAX_PAGES; page++) {
    const res = await fetchImpl(buildNvapiSearchUrl(conditions, boundary, page), {
      headers: NVAPI_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`nvapi_http_${res.status}`)
    const payload = (await res.json()) as NvapiSearchResponse
    if (payload.meta?.status !== 200 || !payload.data) throw new Error('nvapi_invalid_response')
    const items = payload.data.items ?? []
    upstreamTotal = payload.data.totalCount ?? upstreamTotal
    items.forEach((v) => collected.push(mapNvapiVideoToRankingItem(v, collected.length + 1)))
    if (!payload.data.hasNext || items.length === 0) break
    if (page === REALTIME_MAX_PAGES) truncated = true
  }
  const filtered = applyRealtimeRangeFilters(collected, conditions).map((it, i) => ({ ...it, rank: i + 1 }))
  return { items: filtered, upstreamTotal, truncated }
}

// ===== マージ（S3） =====

export interface MergedPagePlan {
  /** リアルタイム配列から取り出す [from, to) */
  realtimeFrom: number
  realtimeTo: number
  /** Snapshot から取る offset と件数（0なら不要） */
  snapshotOffset: number
  snapshotLimit: number
  /** このページの先頭のグローバル index（rank 付与用） */
  globalStart: number
}

/**
 * ページ p を「リアルタイム区間（先頭 R 件）＋ Snapshot」のどこから埋めるかを決める。
 * グローバルな並びは [realtime(新しい順)] ++ [snapshot(新しい順)]。
 */
export function planMergedPage(page: number, pageSize: number, realtimeCount: number): MergedPagePlan {
  const globalStart = (page - 1) * pageSize
  const globalEnd = globalStart + pageSize
  const realtimeFrom = Math.min(globalStart, realtimeCount)
  const realtimeTo = Math.min(globalEnd, realtimeCount)
  const snapshotLimit = pageSize - (realtimeTo - realtimeFrom)
  return {
    realtimeFrom,
    realtimeTo,
    snapshotOffset: Math.max(0, globalStart - realtimeCount),
    snapshotLimit,
    globalStart,
  }
}

/**
 * ページを組み立てる。Snapshot 側にリアルタイム区間と同じ動画があれば
 * （インデックス確定時刻のズレ）Snapshot 側を落として重複を防ぐ。
 * snapshotItems は plan.snapshotOffset から始まる配列を渡す。
 */
export function assembleMergedPage(
  realtimeItems: RankingItem[],
  snapshotItems: RankingItem[],
  plan: MergedPagePlan
): RankingItem[] {
  const realtimeIds = new Set(realtimeItems.map((it) => it.id))
  const head = realtimeItems.slice(plan.realtimeFrom, plan.realtimeTo)
  const tail = snapshotItems.filter((it) => !realtimeIds.has(it.id)).slice(0, plan.snapshotLimit)
  return [...head, ...tail].map((it, i) => ({ ...it, rank: plan.globalStart + i + 1 }))
}
