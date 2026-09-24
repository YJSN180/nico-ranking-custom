// リアルタイム検索（検索リアルタイム統合計画 S2）
// Snapshot API のインデックスは毎朝 5 時前後の更新で止まるため、それ以降の区間だけを
// ニコニコ公式フロントが使う nvapi v2 search から取得し、Snapshot結果の先頭にマージする。
// 境界 T は固定の 05:00 JST ではなく、同じ条件で Snapshot が実際に持つ最新の投稿時刻の 1 秒後にする
// （更新の完了が遅れると、固定境界では索引未反映の 1 日分がどちらの区間にも入らない。2026-09-22 実測）。
// 索引の最新の動画は索引側（T より前）に入るので、新着の取得元に無い動画（ショートなど）でも欠けない。
// nvapi は非公開APIだが、既存の lib/scraper.ts と同じヘッダーで既に依存している。
import type { RankingItem } from '@/types/ranking'
import { nicoPageOwnerId } from './nico-page-search'
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

/** 環境変数による即時ロールバック（'false' で Snapshot 単独）。/api/search と /api/search/realtime で共有 */
export function isRealtimeEnabled(): boolean {
  return process.env.SEARCH_REALTIME_ENABLED !== 'false'
}

/** 全体予算（overall）と1リクエストのタイムアウトを合成する */
function combineSignals(overall: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const perRequest = AbortSignal.timeout(timeoutMs)
  if (!overall) return perRequest
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any
  return typeof anyFn === 'function' ? anyFn([overall, perRequest]) : overall
}

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

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** クライアントが持ち回る境界として受け付ける上限（これより古い値は捨てて決め直す） */
export const REALTIME_BOUNDARY_MAX_AGE_DAYS = 60
/** Snapshot に 1 件も無い条件で使う既定の遡り幅 */
export const REALTIME_BOUNDARY_FALLBACK_HOURS = 48

/** Date を +09:00 表記の ISO 文字列にする（Snapshot の filters と nvapi の minRegisteredAt の両方が受け付ける形） */
export function formatJstIso(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}+09:00`
}

export interface FreshQuery {
  kind: 'keyword' | 'tag'
  query: string
}

/**
 * 本家の検索ページ・タグページ（最新区間、lib/search/fresh-segment.ts）の URL で表せる条件だけを対象にする。
 * ジャンル指定、タグの OR/NOT、キーワードとタグの併用は対象外（null）。
 */
export function freshQueryFor(conditions: SearchConditions): FreshQuery | null {
  if (conditions.genres.length > 0) return null
  if (conditions.tagConditions.some((c) => c.operator !== 'AND')) return null
  const andTags = conditions.tagConditions.map((c) => c.tag).filter((t) => t.length > 0)
  if (conditions.targets === 'tag') {
    const tags = [conditions.q, ...andTags].filter((t) => t.length > 0)
    return tags.length > 0 ? { kind: 'tag', query: tags.join(' ') } : null
  }
  if (!conditions.q) return andTags.length > 0 ? { kind: 'tag', query: andTags.join(' ') } : null
  if (andTags.length > 0) return null
  return { kind: 'keyword', query: conditions.q }
}

/**
 * nvapi の動画検索が受け付ける条件か。keyword と tag はどちらか一方だけが必須で、
 * ジャンルだけ（keyword, tag or lockTag is required）と併用（only keyword, tag or lockTag can be set）は 400 になる（2026-09-25 実測）。
 */
function isNvapiQueryable(conditions: SearchConditions): boolean {
  const q = conditions.q.trim()
  const hasKeyword = conditions.targets === 'keyword' && q.length > 0
  const hasTag = (conditions.targets === 'tag' && q.length > 0) || conditions.tagConditions.some((c) => c.operator === 'AND' && c.tag.trim().length > 0)
  return hasKeyword !== hasTag
}

/**
 * 境界に依存しない条件（並び順・タグ条件・新着の取得元が応じるか）だけでマージ候補か判定する。
 * 取得元が応じない条件で合成すると、毎回失敗して代わりの経路に入るだけなので、はじめから索引だけにする。
 */
export function isRealtimeCandidate(conditions: SearchConditions): boolean {
  if (conditions.sort !== '-startTime') return false
  if (conditions.tagConditions.some((c) => c.operator !== 'AND')) return false
  // ショートは nvapi に無く、本家のショートページ（最新区間）だけが境界以降の取得元になる
  if (conditions.contentType === 'short') return freshQueryFor(conditions) !== null
  return isNvapiQueryable(conditions)
}

/** 2 ページ目以降にクライアントが返してくる境界の検証。不正・未来・古すぎる値は null */
export function parseRequestedBoundary(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw) return null
  const t = new Date(raw).getTime()
  if (!Number.isFinite(t)) return null
  if (t > now.getTime()) return null
  if (now.getTime() - t > REALTIME_BOUNDARY_MAX_AGE_DAYS * DAY_MS) return null
  return raw
}

/**
 * リアルタイム区間の境界 T を決める。Snapshot 側は T より前、新着側（nvapi・本家ページ）は T 以降を受け持つ。
 * 1. クライアントが持ち回った境界（ページ間で一貫させる）
 * 2. 同じ条件で Snapshot が持つ最新の投稿時刻の 1 秒後（投稿時刻は秒単位なので、索引の最新は Snapshot 側に入る。
 *    それより後は Snapshot に無いので新着側で補う）
 * 3. Snapshot に 1 件も無い（または読めない）ときは REALTIME_BOUNDARY_FALLBACK_HOURS 前
 */
export function resolveRealtimeBoundary(input: { requested?: string | null; newestSnapshotStartTime?: string | null; now?: Date }): string {
  const now = input.now ?? new Date()
  const requested = parseRequestedBoundary(input.requested ?? null, now)
  if (requested) return requested
  const newest = input.newestSnapshotStartTime ? new Date(input.newestSnapshotStartTime).getTime() : Number.NaN
  if (Number.isFinite(newest)) return formatJstIso(new Date(newest + 1000))
  return formatJstIso(new Date(now.getTime() - REALTIME_BOUNDARY_FALLBACK_HOURS * HOUR_MS))
}

/**
 * この条件でリアルタイム区間をマージできるか。
 * - ソートが「投稿日時が新しい順」のときだけ（境界とソートキーが一致し、区間を先頭に置ける）
 * - タグの OR / NOT は nvapi 応答にタグが無く後付け判定できないため不可
 * - 投稿日範囲の上限が境界より前なら区間は空なので不要
 */
export function isRealtimeMergeable(conditions: SearchConditions, boundary: string): boolean {
  if (!isRealtimeCandidate(conditions)) return false
  if (conditions.dateTo && new Date(conditions.dateTo).getTime() < new Date(boundary).getTime()) return false
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
  // チャンネルの owner.id は "123" でも "ch123" でも来るので、本家ページ・Worker と同じ規則で channel/chNNN にそろえる
  const authorId = nicoPageOwnerId(video) ?? undefined
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
      // Snapshot と同様、再生時間フィルタ指定時は duration 不明の動画を除外する
      (c.durationMin === undefined && c.durationMax === undefined
        ? true
        : it.duration !== undefined && inRange(it.duration, c.durationMin, c.durationMax))
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
  timeoutMs = 4000,
  /** 区間全体の時間予算。超えたら残りページを諦めて throw（呼び出し側で Snapshot 単独に縮退） */
  overallSignal?: AbortSignal
): Promise<RealtimeSegment> {
  // nvapi の動画検索はショート（ss）を返さない。ショートだけの検索では nvapi 区間は空で、
  // 最新区間（本家のショートページ、lib/search/fresh-segment.ts）だけがリアルタイム区間になる
  if (conditions.contentType === 'short') return { items: [], upstreamTotal: 0, truncated: false }
  const collected: RankingItem[] = []
  let upstreamTotal = 0
  let truncated = false
  for (let page = 1; page <= REALTIME_MAX_PAGES; page++) {
    const res = await fetchImpl(buildNvapiSearchUrl(conditions, boundary, page), {
      headers: NVAPI_HEADERS,
      cache: 'no-store',
      signal: combineSignals(overallSignal, timeoutMs),
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
