import { shareSearchRequest } from './shared-request'
// スナップショット検索API v2 のリクエスト構築とレスポンス変換
// https://site.nicovideo.jp/search-api-docs/snapshot
// 注意: このAPIはCORS非対応のため、必ずサーバー側（app/api/search）から呼ぶこと

import type { RankingItem } from '@/types/ranking'

export const SNAPSHOT_API_URL =
  'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

export const SEARCH_PAGE_SIZE = 50
export const SEARCH_MAX_OFFSET = 100000

// スナップショットAPIのジャンル（genre フィールドの実値、全17種）
// 注意: 「歌ってみた」「VOCALOID」等の新ジャンル体系は snapshot API には存在しない（実測で0件）
export const SEARCH_GENRES = [
  'アニメ',
  'エンターテイメント',
  'ゲーム',
  'スポーツ',
  'ダンス',
  'ラジオ',
  '音楽・サウンド',
  '解説・講座',
  '技術・工作',
  '動物',
  '自然',
  '社会・政治・時事',
  '乗り物',
  '旅行・アウトドア',
  '料理',
  '例のソレ',
  'その他',
] as const

// ソート指定（スナップショットAPIの _sort 値をそのまま使用）
export const SEARCH_SORT_OPTIONS = [
  { value: '-viewCounter', label: '再生数が多い順' },
  { value: '-startTime', label: '投稿日時が新しい順' },
  { value: '-likeCounter', label: 'いいね！数が多い順' },
  { value: '-mylistCounter', label: 'マイリスト数が多い順' },
  { value: '-lastCommentTime', label: 'コメントが新しい順' },
  { value: '+lastCommentTime', label: 'コメントが古い順' },
  { value: '+viewCounter', label: '再生数が少ない順' },
  { value: '-commentCounter', label: 'コメント数が多い順' },
  { value: '+commentCounter', label: 'コメント数が少ない順' },
  { value: '+likeCounter', label: 'いいね！数が少ない順' },
  { value: '+mylistCounter', label: 'マイリスト数が少ない順' },
  { value: '+startTime', label: '投稿日時が古い順' },
  { value: '-lengthSeconds', label: '再生時間が長い順' },
  { value: '+lengthSeconds', label: '再生時間が短い順' },
] as const

/**
 * 動画の種類。Snapshot API の contentType（2026-04-15 追加、enum long/short）で索引側で絞る。
 * ショート（ss で始まる ID）は本家では別タブだが、Snapshot の索引には動画と一緒に入っている。
 */
export type SearchContentType = 'all' | 'long' | 'short'

export const SEARCH_CONTENT_TYPE_OPTIONS: ReadonlyArray<{ value: SearchContentType; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'long', label: '動画' },
  { value: 'short', label: 'ショート' },
]

/** URL / API パラメータの contentType を安全に読む（不正値・未指定は all） */
export function parseSearchContentType(value: string | null | undefined): SearchContentType {
  return value === 'long' || value === 'short' ? value : 'all'
}

const VALID_SORT_VALUES = new Set<string>(SEARCH_SORT_OPTIONS.map((o) => o.value))
const VALID_GENRES = new Set<string>(SEARCH_GENRES)

// カスタムランキングと同じ演算子体系（types/custom-ranking.ts の TagOperator と同一）
export type SearchTagOperator = 'AND' | 'OR' | 'NOT'

export interface SearchTagCondition {
  tag: string
  operator: SearchTagOperator
}

// スナップショットAPI jsonFilter のノード型
type JsonFilterNode =
  | { type: 'equal'; field: string; value: string }
  | { type: 'and'; filters: JsonFilterNode[] }
  | { type: 'or'; filters: JsonFilterNode[] }
  | { type: 'not'; filter: JsonFilterNode }

export interface SearchConditions {
  q: string
  /** keyword: タイトル・説明文・タグを対象 / tag: タグ完全一致 */
  targets: 'keyword' | 'tag'
  /** 動画の種類（all=絞り込みなし / long=動画 / short=ショート） */
  contentType: SearchContentType
  sort: string
  genres: string[]
  viewsMin?: number
  viewsMax?: number
  commentsMin?: number
  commentsMax?: number
  likesMin?: number
  likesMax?: number
  mylistsMin?: number
  mylistsMax?: number
  /** 再生時間（秒） */
  durationMin?: number
  durationMax?: number
  /** 投稿日時（ISO 8601） */
  dateFrom?: string
  dateTo?: string
  /** タグの論理条件（AND/OR/NOT、タグ完全一致）。キーワード検索と併用可能 */
  tagConditions: SearchTagCondition[]
  page: number
}

interface SnapshotVideo {
  contentId: string
  title: string
  thumbnailUrl: string | null
  viewCounter: number
  commentCounter: number
  likeCounter: number
  mylistCounter: number
  lengthSeconds: number
  startTime: string
  userId: number | null
  channelId: number | null
  tags: string | null
  genre: string | null
}

export interface SnapshotSearchResponse {
  meta: {
    status: number
    totalCount?: number
    errorCode?: string
    errorMessage?: string
  }
  data?: SnapshotVideo[]
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** Date を +09:00 表記の ISO 文字列（秒単位）にする（Snapshot の filters と nvapi の minRegisteredAt の両方が受け付ける形） */
export function formatJstIso(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}+09:00`
}

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  // 指数表記にならない範囲に収める（正規形の文字列が読み直しで変わらないように）
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER)
}

/** 投稿日時は +09:00 の秒単位にそろえる。読めない値と、4 桁の年に収まらない値は無視する */
function parseDate(value: string | null): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  const year = new Date(d.getTime() + JST_OFFSET_MS).getUTCFullYear()
  if (year < 1970 || year > 9999) return undefined
  return formatJstIso(d)
}

const MAX_TAG_CONDITIONS = 10
/** 検索語（q）の最大文字数。超えた分は正規化で切り捨てるので、条件入力では超える前に知らせる */
export const SEARCH_MAX_QUERY_LENGTH = 200
const MAX_TAG_LENGTH = 100
const DEFAULT_SORT = '-viewCounter'

/**
 * 前後の空白を除き、UTF-16 の単位で max 文字までに切る（これまでと同じ数え方で、URL を長くしすぎない）。
 * 切れ目でサロゲートペアを割ったときは、残った上位サロゲートを落とす（割れた文字は URL で別の文字に化ける）
 */
function normalizeText(raw: string, max: number): string {
  let text = raw.trim().slice(0, max)
  if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1)
  return text.trim()
}

function parseTagConditions(params: URLSearchParams): SearchTagCondition[] {
  const conditions: SearchTagCondition[] = []
  const collect = (key: string, operator: SearchTagOperator) => {
    const seen = new Set<string>()
    for (const raw of params.getAll(key)) {
      const tag = normalizeText(raw, MAX_TAG_LENGTH)
      if (!tag || seen.has(tag)) continue
      seen.add(tag)
      conditions.push({ tag, operator })
    }
  }
  collect('tagAnd', 'AND')
  collect('tagOr', 'OR')
  collect('tagNot', 'NOT')
  return conditions.slice(0, MAX_TAG_CONDITIONS)
}

/**
 * URLSearchParams から検索条件を安全にパース（不正値は無視）。結果は正規形：
 * 文字列は前後の空白を除き、ジャンルは一覧の順で重複なし、タグは AND・OR・NOT の順で重複なし、投稿日時は +09:00 の秒単位
 */
export function parseSearchConditions(params: URLSearchParams): SearchConditions {
  const sort = params.get('sort') ?? DEFAULT_SORT
  const genreSet = new Set(params.getAll('genre').filter((g) => VALID_GENRES.has(g)))
  const page = parsePositiveInt(params.get('page')) ?? 1

  return {
    q: normalizeText(params.get('q') ?? '', SEARCH_MAX_QUERY_LENGTH),
    targets: params.get('targets') === 'tag' ? 'tag' : 'keyword',
    contentType: parseSearchContentType(params.get('contentType')),
    sort: VALID_SORT_VALUES.has(sort) ? sort : DEFAULT_SORT,
    genres: SEARCH_GENRES.filter((genre) => genreSet.has(genre)),
    viewsMin: parsePositiveInt(params.get('viewsMin')),
    viewsMax: parsePositiveInt(params.get('viewsMax')),
    commentsMin: parsePositiveInt(params.get('commentsMin')),
    commentsMax: parsePositiveInt(params.get('commentsMax')),
    likesMin: parsePositiveInt(params.get('likesMin')),
    likesMax: parsePositiveInt(params.get('likesMax')),
    mylistsMin: parsePositiveInt(params.get('mylistsMin')),
    mylistsMax: parsePositiveInt(params.get('mylistsMax')),
    durationMin: parsePositiveInt(params.get('durationMin')),
    durationMax: parsePositiveInt(params.get('durationMax')),
    dateFrom: parseDate(params.get('dateFrom')),
    dateTo: parseDate(params.get('dateTo')),
    tagConditions: parseTagConditions(params),
    page: Math.max(1, Math.min(page, Math.floor(SEARCH_MAX_OFFSET / SEARCH_PAGE_SIZE))),
  }
}

/** /api/search だけが受け取る、ページ間で区間を一貫させるための値（前回応答の新着件数と境界） */
export interface SearchApiExtras {
  rtCount?: number
  boundary?: string
}

/** 新着件数の上限（nvapi の深さ 5,000 件と本家ページの分より十分大きい値） */
const MAX_RT_COUNT = 100000

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

const SEARCH_API_KEYS = new Set<string>([
  'q',
  'targets',
  'contentType',
  'sort',
  'genre',
  ...NUMERIC_KEYS,
  'dateFrom',
  'dateTo',
  'tagAnd',
  'tagOr',
  'tagNot',
  'page',
  'rtCount',
  'boundary',
])

/**
 * 検索条件を URL クエリの正規形にする（画面の URL・保存した検索・/api/search で共通）。
 * 既定値は省き、キーは決まった順に並べる。parseSearchConditions の結果を渡すと、読み直しても同じ文字列になる
 */
export function buildSearchQuery(conditions: SearchConditions, extras: SearchApiExtras = {}): string {
  const params = new URLSearchParams()
  if (conditions.q) params.set('q', conditions.q)
  if (conditions.targets !== 'keyword') params.set('targets', conditions.targets)
  if (conditions.contentType !== 'all') params.set('contentType', conditions.contentType)
  if (conditions.sort !== DEFAULT_SORT) params.set('sort', conditions.sort)
  for (const genre of conditions.genres) params.append('genre', genre)
  for (const key of NUMERIC_KEYS) {
    const value = conditions[key]
    if (value !== undefined) params.set(key, String(value))
  }
  if (conditions.dateFrom) params.set('dateFrom', conditions.dateFrom)
  if (conditions.dateTo) params.set('dateTo', conditions.dateTo)
  const keyOf: Record<SearchTagOperator, string> = { AND: 'tagAnd', OR: 'tagOr', NOT: 'tagNot' }
  for (const operator of ['AND', 'OR', 'NOT'] as const) {
    for (const condition of conditions.tagConditions) {
      if (condition.operator === operator) params.append(keyOf[operator], condition.tag)
    }
  }
  if (conditions.page > 1) params.set('page', String(conditions.page))
  if (extras.rtCount !== undefined && extras.rtCount > 0) params.set('rtCount', String(extras.rtCount))
  if (extras.boundary) params.set('boundary', extras.boundary)
  return params.toString()
}

function parseSearchApiExtras(params: URLSearchParams): SearchApiExtras {
  const rtCount = parsePositiveInt(params.get('rtCount'))
  const boundary = parseDate(params.get('boundary'))
  return {
    ...(rtCount !== undefined ? { rtCount: Math.min(rtCount, MAX_RT_COUNT) } : {}),
    ...(boundary ? { boundary } : {}),
  }
}

/** 開始・終了の片方だけ、同じ日付/時刻は有効。逆順だけを拒否する。 */
export function isSearchDateRangeReversed({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }): boolean {
  return Boolean(dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo))
}

/**
 * /api/search の問い合わせ（先頭の ? を除いた rawQuery）を読む。知らないキーを含むか、正規形（buildSearchQuery）と
 * 違う書き方なら null。同じ条件を別の URL にして CDN のキャッシュを外し、上流への問い合わせを増やせないようにする
 */
export function parseSearchApiQuery(
  params: URLSearchParams,
  rawQuery: string
): { conditions: SearchConditions; extras: SearchApiExtras } | null {
  for (const key of params.keys()) {
    if (!SEARCH_API_KEYS.has(key)) return null
  }
  const conditions = parseSearchConditions(params)
  const extras = parseSearchApiExtras(params)
  if (isSearchDateRangeReversed(conditions)) return null
  return buildSearchQuery(conditions, extras) === rawQuery ? { conditions, extras } : null
}

/**
 * タグ論理条件を jsonFilter に変換
 * カスタムランキング（lib/custom-ranking-filter.ts）と同じ意味論:
 * (ANDグループをすべて満たす) OR (ORグループのいずれかを満たす)、NOTは常に除外
 */
export function buildTagJsonFilter(conditions: SearchTagCondition[]): JsonFilterNode | null {
  const equal = (tag: string): JsonFilterNode => ({ type: 'equal', field: 'tagsExact', value: tag })
  const ands = conditions.filter((c) => c.operator === 'AND').map((c) => equal(c.tag))
  const ors = conditions.filter((c) => c.operator === 'OR').map((c) => equal(c.tag))
  const nots = conditions.filter((c) => c.operator === 'NOT').map((c) => equal(c.tag))

  const positiveParts: JsonFilterNode[] = []
  if (ands.length > 0) positiveParts.push(ands.length === 1 ? ands[0]! : { type: 'and', filters: ands })
  if (ors.length > 0) positiveParts.push(ors.length === 1 ? ors[0]! : { type: 'or', filters: ors })

  const parts: JsonFilterNode[] = []
  if (positiveParts.length === 1) {
    parts.push(positiveParts[0]!)
  } else if (positiveParts.length === 2) {
    parts.push({ type: 'or', filters: positiveParts })
  }
  if (nots.length > 0) {
    parts.push({
      type: 'not',
      filter: nots.length === 1 ? nots[0]! : { type: 'or', filters: nots },
    })
  }

  if (parts.length === 0) return null
  return parts.length === 1 ? parts[0]! : { type: 'and', filters: parts }
}

function appendRangeFilter(
  params: URLSearchParams,
  field: string,
  min?: number,
  max?: number
): void {
  if (min !== undefined) params.set(`filters[${field}][gte]`, String(min))
  if (max !== undefined) params.set(`filters[${field}][lte]`, String(max))
}

/** スナップショットAPIへのリクエストURLを構築 */
export interface SnapshotWindow {
  offset?: number
  limit?: number
  /** リアルタイム区間とのマージ時: この時刻（境界T）より前の投稿だけを対象にし、
      nvapi 側（minRegisteredAt=T、境界を含む）と構成的に排他にする */
  startTimeBefore?: string
}

/**
 * @param window リアルタイム区間とのマージ時（S3）に、ページ番号から導いた
 *   既定の offset/limit を上書きする
 */
export function buildSnapshotSearchUrl(conditions: SearchConditions, window: SnapshotWindow = {}): string {
  const params = new URLSearchParams()
  params.set('q', conditions.q)
  params.set(
    'targets',
    conditions.targets === 'tag' ? 'tagsExact' : 'title,description,tags'
  )
  params.set(
    'fields',
    [
      'contentId',
      'title',
      'thumbnailUrl',
      'viewCounter',
      'commentCounter',
      'likeCounter',
      'mylistCounter',
      'lengthSeconds',
      'startTime',
      'userId',
      'channelId',
      'tags',
      'genre',
    ].join(',')
  )
  params.set('_sort', conditions.sort)
  params.set('_offset', String(window.offset ?? (conditions.page - 1) * SEARCH_PAGE_SIZE))
  params.set('_limit', String(Math.max(1, window.limit ?? SEARCH_PAGE_SIZE)))
  params.set('_context', 'nico-rank.com')

  conditions.genres.forEach((genre, index) => {
    params.set(`filters[genre][${index}]`, genre)
  })
  // 動画の種類は索引側で絞る（後付けフィルタだとページ内の件数が欠けて offset が狂う）
  if (conditions.contentType !== 'all') params.set('filters[contentType][0]', conditions.contentType)
  appendRangeFilter(params, 'viewCounter', conditions.viewsMin, conditions.viewsMax)
  appendRangeFilter(params, 'commentCounter', conditions.commentsMin, conditions.commentsMax)
  appendRangeFilter(params, 'likeCounter', conditions.likesMin, conditions.likesMax)
  appendRangeFilter(params, 'mylistCounter', conditions.mylistsMin, conditions.mylistsMax)
  appendRangeFilter(params, 'lengthSeconds', conditions.durationMin, conditions.durationMax)
  if (conditions.dateFrom) params.set('filters[startTime][gte]', conditions.dateFrom)
  if (window.startTimeBefore) {
    // 境界より前（排他）。dateTo が境界より前ならそちらが上限（この場合はマージ対象外だが安全側）
    if (conditions.dateTo && new Date(conditions.dateTo).getTime() < new Date(window.startTimeBefore).getTime()) {
      params.set('filters[startTime][lte]', conditions.dateTo)
    } else {
      params.set('filters[startTime][lt]', window.startTimeBefore)
    }
  } else if (conditions.dateTo) {
    params.set('filters[startTime][lte]', conditions.dateTo)
  }

  // タグ論理条件は jsonFilter で指定（filters と併用可能なことは実測確認済み）
  const tagFilter = buildTagJsonFilter(conditions.tagConditions)
  if (tagFilter) params.set('jsonFilter', JSON.stringify(tagFilter))

  return `${SNAPSHOT_API_URL}?${params.toString()}`
}

/**
 * 同じ条件で Snapshot が持つ最新の投稿時刻を 1 件だけ取る（リアルタイム区間の境界の決定用）。
 * 投稿日時の範囲は外す: 索引の最新は日付の条件によらず、上限が過去の範囲では、上限がこの最新より前になって
 * 合成しない判断ができる（範囲内の最新を境界にすると、過去の範囲でも毎回合成に入る）。
 * 該当なしなら null。上流エラーは throw（呼び出し側で従来の境界に縮退する）。
 */
export async function fetchSnapshotNewestStartTime(
  conditions: SearchConditions,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
  /** 呼び出し全体の期限（任意）。timeoutMs と早い方で打ち切る */
  signal?: AbortSignal
): Promise<string | null> {
  const url = buildSnapshotSearchUrl(
    { ...conditions, sort: '-startTime', page: 1, dateFrom: undefined, dateTo: undefined },
    { offset: 0, limit: 1 }
  )
  return shareSearchRequest(fetchImpl, url, timeoutMs, signal, async (sharedSignal) => {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'nico-rank.com (Re:turn) search' },
      cache: 'no-store',
      signal: sharedSignal,
    })
    if (!res.ok) throw new Error(`snapshot_http_${res.status}`)
    const payload = (await res.json()) as { meta?: { status?: number }; data?: Array<{ startTime?: unknown }> }
    if (payload.meta?.status !== 200 || !Array.isArray(payload.data)) throw new Error('snapshot_invalid_response')
    const startTime = payload.data[0]?.startTime
    return typeof startTime === 'string' ? startTime : null
  })
}

/** スナップショットAPIのレスポンスを RankingItem に変換 */
export function mapSnapshotVideoToRankingItem(
  video: SnapshotVideo,
  index: number,
  offset: number
): RankingItem {
  const authorId =
    video.channelId !== null && video.channelId !== undefined
      ? `channel/ch${video.channelId}`
      : video.userId !== null && video.userId !== undefined
        ? String(video.userId)
        : undefined

  return {
    rank: offset + index + 1,
    id: video.contentId,
    title: video.title,
    thumbURL: video.thumbnailUrl ?? '',
    views: video.viewCounter ?? 0,
    comments: video.commentCounter ?? 0,
    likes: video.likeCounter ?? 0,
    mylists: video.mylistCounter ?? 0,
    duration: video.lengthSeconds ?? undefined,
    registeredAt: video.startTime ?? undefined,
    authorId,
    tags: video.tags ? video.tags.split(' ').filter(Boolean) : undefined,
  }
}
