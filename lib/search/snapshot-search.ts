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
  { value: '+viewCounter', label: '再生数が少ない順' },
  { value: '-commentCounter', label: 'コメント数が多い順' },
  { value: '+commentCounter', label: 'コメント数が少ない順' },
  { value: '-likeCounter', label: 'いいね！数が多い順' },
  { value: '+likeCounter', label: 'いいね！数が少ない順' },
  { value: '-mylistCounter', label: 'マイリスト数が多い順' },
  { value: '+mylistCounter', label: 'マイリスト数が少ない順' },
  { value: '-startTime', label: '投稿日時が新しい順' },
  { value: '+startTime', label: '投稿日時が古い順' },
  { value: '-lengthSeconds', label: '再生時間が長い順' },
  { value: '+lengthSeconds', label: '再生時間が短い順' },
  { value: '-lastCommentTime', label: 'コメントが新しい順' },
  { value: '+lastCommentTime', label: 'コメントが古い順' },
] as const

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

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.floor(n)
}

function parseDate(value: string | null): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

const MAX_TAG_CONDITIONS = 10

function parseTagConditions(params: URLSearchParams): SearchTagCondition[] {
  const conditions: SearchTagCondition[] = []
  const collect = (key: string, operator: SearchTagOperator) => {
    for (const raw of params.getAll(key)) {
      const tag = raw.trim().slice(0, 100)
      if (tag) conditions.push({ tag, operator })
    }
  }
  collect('tagAnd', 'AND')
  collect('tagOr', 'OR')
  collect('tagNot', 'NOT')
  return conditions.slice(0, MAX_TAG_CONDITIONS)
}

/** URLSearchParams から検索条件を安全にパース（不正値は無視） */
export function parseSearchConditions(params: URLSearchParams): SearchConditions {
  const sort = params.get('sort') ?? '-viewCounter'
  const rawGenres = params.getAll('genre').filter((g) => VALID_GENRES.has(g))
  const page = parsePositiveInt(params.get('page')) ?? 1

  return {
    q: (params.get('q') ?? '').slice(0, 200),
    targets: params.get('targets') === 'tag' ? 'tag' : 'keyword',
    sort: VALID_SORT_VALUES.has(sort) ? sort : '-viewCounter',
    genres: rawGenres,
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
  appendRangeFilter(params, 'viewCounter', conditions.viewsMin, conditions.viewsMax)
  appendRangeFilter(params, 'commentCounter', conditions.commentsMin, conditions.commentsMax)
  appendRangeFilter(params, 'likeCounter', conditions.likesMin, conditions.likesMax)
  appendRangeFilter(params, 'mylistCounter', conditions.mylistsMin, conditions.mylistsMax)
  appendRangeFilter(params, 'lengthSeconds', conditions.durationMin, conditions.durationMax)
  if (conditions.dateFrom) params.set('filters[startTime][gte]', conditions.dateFrom)
  if (conditions.dateTo) params.set('filters[startTime][lte]', conditions.dateTo)

  // タグ論理条件は jsonFilter で指定（filters と併用可能なことは実測確認済み）
  const tagFilter = buildTagJsonFilter(conditions.tagConditions)
  if (tagFilter) params.set('jsonFilter', JSON.stringify(tagFilter))

  return `${SNAPSHOT_API_URL}?${params.toString()}`
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
