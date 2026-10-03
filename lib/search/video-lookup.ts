// 動画IDで開く（検索欄に動画ID・視聴ページの URL を入れたとき）
//
// 1 件ずつ watch v3_guest を引く（新着のタグ補完と同じ経路。2026-10-02 実測: Accept: */* が必要、
// 存在しない ID は 404 + meta.errorCode = NOT_FOUND）。新しい外部サービスは使わない。
import type { RankingItem, TagDetail } from '@/types/ranking'
import {
  buildV3GuestUrl,
  isVideoId,
  parseTagDetails,
  parseV3GuestAuthorId,
} from './realtime-tags'
import { parseChannelInfo } from './owner-info'
import { shareSearchRequest } from './shared-request'

/** 一度に開ける動画の数（未認証で叩ける増幅器にしない） */
export const VIDEO_LOOKUP_MAX_IDS = 20
const DEFAULT_CONCURRENCY = 5
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 4000

const V3_GUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: '*/*',
  'Accept-Language': 'ja,en;q=0.9',
}

const WATCH_URL =
  /^(?:https?:\/\/)?(?:(?:www\.|sp\.)?nicovideo\.jp\/watch|nico\.ms)\/([a-z]{2}\d+)(?:[/?#].*)?$/i

/**
 * 入力が動画ID・視聴ページの URL だけでできていれば、ID の配列（入力順・重複なし）。
 * 語が 1 つでも混ざれば null（キーワード検索として扱う）
 */
export function parseVideoIdsInput(text: string): string[] | null {
  const tokens = text.split(/[\s,、]+/u).filter(Boolean)
  if (tokens.length === 0) return null
  const ids: string[] = []
  for (const token of tokens) {
    const id = (token.match(WATCH_URL)?.[1] ?? token).toLowerCase()
    if (!isVideoId(id)) return null
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/** /api/search/videos の問い合わせの正規形（入力順を保つ） */
export function buildVideoLookupQuery(ids: string[]): string {
  return new URLSearchParams({ ids: ids.join(',') }).toString()
}

/** サーバー側で受け取る ID。形式不正・重複・上限超えは捨てる */
export function sanitizeLookupIds(raw: string | null): string[] {
  if (!raw) return []
  const ids: string[] = []
  for (const id of raw.split(',')) {
    if (isVideoId(id) && !ids.includes(id)) ids.push(id)
    if (ids.length >= VIDEO_LOOKUP_MAX_IDS) break
  }
  return ids
}

interface V3GuestVideoPayload {
  data?: {
    video?: {
      title?: string
      duration?: number
      registeredAt?: string
      count?: {
        view?: number
        comment?: number
        mylist?: number
        like?: number
      }
      thumbnail?: {
        url?: string | null
        middleUrl?: string | null
        largeUrl?: string | null
      }
    }
    owner?: {
      id?: number | string | null
      nickname?: string | null
      iconUrl?: string | null
    } | null
  }
}

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined

/** v3_guest の応答を、ランキング・検索と同じ行で表示できる形にする（想定外の形なら null） */
export function parseV3GuestVideo(
  payload: unknown,
  id: string,
): RankingItem | null {
  const data = (payload as V3GuestVideoPayload | null)?.data
  const video = data?.video
  if (!video || typeof video.title !== 'string' || video.title.length === 0)
    return null
  const tagDetails: TagDetail[] = parseTagDetails(payload)
  const channel = parseChannelInfo(payload)
  const owner = data?.owner
  const thumb =
    video.thumbnail?.largeUrl ||
    video.thumbnail?.middleUrl ||
    video.thumbnail?.url ||
    ''
  return {
    rank: 0,
    id,
    title: video.title,
    thumbURL: thumb,
    views: count(video.count?.view) ?? 0,
    comments: count(video.count?.comment),
    mylists: count(video.count?.mylist),
    likes: count(video.count?.like),
    tags: tagDetails.map((t) => t.name),
    tagDetails,
    authorId: parseV3GuestAuthorId(payload) ?? undefined,
    authorName:
      channel?.info.name ??
      (typeof owner?.nickname === 'string' ? owner.nickname : undefined),
    authorIcon:
      channel?.info.icon ??
      (typeof owner?.iconUrl === 'string' ? owner.iconUrl : undefined),
    registeredAt:
      typeof video.registeredAt === 'string' ? video.registeredAt : undefined,
    duration: count(video.duration),
  }
}

export interface VideoLookupResult {
  /** 見つかった動画（入力順） */
  items: RankingItem[]
  /** 存在しない・削除された ID（404） */
  missing: string[]
  /** 非公開・限定公開などで見られない ID（403） */
  unavailable: string[]
  /** 通信の失敗・時間切れ（もう一度試せば取れるかもしれない） */
  failed: string[]
}

class LookupStatus extends Error {
  constructor(readonly status: number) {
    super(`lookup_http_${status}`)
  }
}

/** 並列数を絞って v3_guest を引く。1 件の失敗で他を止めない */
export async function fetchVideosByIds(
  ids: string[],
  options: {
    fetchImpl?: typeof fetch
    signal?: AbortSignal
    concurrency?: number
    timeoutMs?: number
  } = {},
): Promise<VideoLookupResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const timeoutMs = options.timeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS
  const found = new Map<string, RankingItem>()
  const result: VideoLookupResult = {
    items: [],
    missing: [],
    unavailable: [],
    failed: [],
  }

  const fetchOne = async (id: string): Promise<void> => {
    try {
      const item = await shareSearchRequest(
        fetchImpl,
        `lookup:${id}`,
        timeoutMs,
        options.signal,
        async (signal) => {
          const res = await fetchImpl(buildV3GuestUrl(id), {
            headers: V3_GUEST_HEADERS,
            cache: 'no-store',
            signal,
          })
          if (!res.ok) throw new LookupStatus(res.status)
          return parseV3GuestVideo(await res.json(), id)
        },
      )
      if (item) found.set(id, item)
      else result.failed.push(id)
    } catch (err) {
      const status = err instanceof LookupStatus ? err.status : 0
      if (status === 404 || status === 410) result.missing.push(id)
      else if (status === 403) result.unavailable.push(id)
      else result.failed.push(id)
    }
  }

  for (let i = 0; i < ids.length; i += concurrency) {
    if (options.signal?.aborted) {
      result.failed.push(...ids.slice(i))
      break
    }
    await Promise.all(ids.slice(i, i + concurrency).map(fetchOne))
  }
  result.items = ids.flatMap((id, index) => {
    const item = found.get(id)
    return item ? [{ ...item, rank: index + 1 }] : []
  })
  return result
}

/** 検索ページの URL（履歴・保存にも同じ形で残す）。q は欄に見せる形（空白区切り） */
export function buildLookupPageQuery(ids: string[]): string {
  return new URLSearchParams({ type: 'id', q: ids.join(' ') }).toString()
}
