// リアルタイム区間のタグ補完（検索リアルタイム統合計画 S4）
// nvapi v2 search の応答にはタグが無いため、区間の動画（有界・通常数件〜数十件）の
// タグ詳細（isLocked 含む）を watch v3_guest から並列取得する。
// 実測: nvapi の /v1/videos/{id}/tags は全件404で死んでおり、v3_guest は
// Accept: */* で 200（Accept: application/json だと406）。1件 0.27〜0.34s。
// 検索応答のクリティカルパスには載せず、クライアントが結果表示後に非同期で呼ぶ。
import type { TagDetail } from '@/types/ranking'
import { shareSearchRequest } from './shared-request'
import { BoundedTtlCache } from './bounded-cache'

/** 1リクエストあたりの上限。未認証で叩ける増幅器になるため小さく保つ（クライアントは分割して呼ぶ） */
export const REALTIME_TAGS_MAX_VIDEOS = 10
const DEFAULT_CONCURRENCY = 8
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 2500

const V3_GUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: '*/*',
  'Accept-Language': 'ja,en;q=0.9',
}

/** ショート（ss）も対象。v3_guest は ss にもタグ付きで応答する（2026-09-22 実測）。番号の先頭に 0 は付かない */
const VIDEO_ID_PATTERN = /^(sm|so|nm|ss)[1-9]\d{0,11}$/

export const isVideoId = (id: string): boolean => VIDEO_ID_PATTERN.test(id)

/** 問い合わせの正規形で ID を並べる順（文字の並びで比べる。画面とサーバーで同じ順にする） */
export const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * タグ補完の問い合わせの正規形（ID は重複なし・昇順）。画面はこれで組み立て、サーバーはこれと同じ形だけを受け付ける
 * （並べ替えや書き換えで CDN のキャッシュを外し、上流への問い合わせを増やせないようにする）
 */
export function buildRealtimeTagsQuery(ids: string[]): string {
  const params = new URLSearchParams()
  const unique = Array.from(new Set(ids)).sort(compareIds)
  if (unique.length > 0) params.set('ids', unique.join(','))
  return params.toString()
}

export function sanitizeVideoIds(raw: string | null, max = REALTIME_TAGS_MAX_VIDEOS): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (!VIDEO_ID_PATTERN.test(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= max) break
  }
  return ids
}

const TRACK_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** actionTrackId は「英数字10文字 + _ + ミリ秒13桁」の形式でないと 400 INVALID_PARAMETER になる（実測） */
export function generateActionTrackId(now: number = Date.now()): string {
  let head = ''
  for (let i = 0; i < 10; i++) head += TRACK_ID_CHARS[Math.floor(Math.random() * TRACK_ID_CHARS.length)]
  return `${head}_${now}`
}

export function buildV3GuestUrl(videoId: string): string {
  return `https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?_frontendId=6&_frontendVersion=0&actionTrackId=${generateActionTrackId()}`
}

interface V3GuestPayload {
  meta?: { status?: number }
  data?: {
    tag?: { items?: Array<{ name?: string; isLocked?: boolean }> }
    owner?: { id?: number | string | null } | null
    channel?: { id?: string | null } | null
  }
}

/** v3_guest の応答から TagDetail[] を取り出す（想定外の形なら空配列） */
export function parseTagDetails(payload: unknown): TagDetail[] {
  const items = (payload as V3GuestPayload | null)?.data?.tag?.items
  if (!Array.isArray(items)) return []
  return items
    .filter((t): t is { name: string; isLocked?: boolean } => typeof t?.name === 'string' && t.name.length > 0)
    .map((t) => ({ name: t.name, isLocked: t.isLocked === true }))
}

/** v3_guest の応答から投稿者 ID（ユーザーは数字、チャンネルは channel/chNNN）を取り出す。不明なら null */
export function parseV3GuestAuthorId(payload: unknown): string | null {
  const data = (payload as V3GuestPayload | null)?.data
  const channelId = data?.channel?.id
  if (typeof channelId === 'string' && channelId.length > 0) return channelId.startsWith('ch') ? `channel/${channelId}` : `channel/ch${channelId}`
  const ownerId = data?.owner?.id
  return typeof ownerId === 'number' || (typeof ownerId === 'string' && ownerId.length > 0) ? String(ownerId) : null
}

export interface RealtimeTagsResult {
  /** 取得できた動画のタグ詳細。失敗した動画は含めない（クライアント側で「未取得」扱い） */
  tagDetails: Record<string, TagDetail[]>
  /** 取得できた動画の投稿者 ID（自動 NG の許可リストの判定用） */
  authorIds: Record<string, string>
  failed: string[]
}

type TagMetadata = { tags: TagDetail[]; authorId: string | null }
let caches = new WeakMap<typeof fetch, BoundedTtlCache<TagMetadata>>()
export function clearTagMetadataCache(): void { caches = new WeakMap() }

/**
 * 並列数を絞って v3_guest を叩き、タグ詳細を集める。
 * 1件でも失敗しても他は返す（部分成功）。
 */
export async function fetchTagDetailsForVideos(
  videoIds: string[],
  /** signal は呼び出し全体の期限。切れたら、まだ問い合わせていない動画は問い合わせずに failed にする */
  options: { fetchImpl?: typeof fetch; concurrency?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<RealtimeTagsResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const timeoutMs = options.timeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS
  const tagDetails: Record<string, TagDetail[]> = {}
  const authorIds: Record<string, string> = {}
  const failed: string[] = []

  let cache = caches.get(fetchImpl)
  if (!cache) { cache = new BoundedTtlCache<TagMetadata>(2000); caches.set(fetchImpl, cache) }
  const metadataCache = cache
  const fetchOne = async (id: string): Promise<void> => {
    try {
      const metadata = metadataCache.get(id, Date.now()) ?? await shareSearchRequest(
        fetchImpl, `tags:${id}`, timeoutMs, options.signal, async (sharedSignal) => {
          const res = await fetchImpl(buildV3GuestUrl(id), {
            headers: V3_GUEST_HEADERS, cache: 'no-store', signal: sharedSignal,
          })
          if (!res.ok) throw new Error(`tags_http_${res.status}`)
          const payload: unknown = await res.json()
          const parsed = { tags: parseTagDetails(payload), authorId: parseV3GuestAuthorId(payload) }
          // Only upstream metadata is cached. NG rules/allow lists are evaluated by the route.
          if (!sharedSignal.aborted && Array.isArray((payload as V3GuestPayload)?.data?.tag?.items)) {
            metadataCache.set(id, parsed, Date.now() + 60_000)
          }
          return parsed
        }
      )
      tagDetails[id] = metadata.tags
      if (metadata.authorId) authorIds[id] = metadata.authorId
    } catch {
      failed.push(id)
    }
  }

  for (let i = 0; i < videoIds.length; i += concurrency) {
    if (options.signal?.aborted) {
      failed.push(...videoIds.slice(i))
      break
    }
    await Promise.all(videoIds.slice(i, i + concurrency).map(fetchOne))
  }
  return { tagDetails, authorIds, failed }
}
