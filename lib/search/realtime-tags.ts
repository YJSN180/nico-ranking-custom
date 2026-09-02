// リアルタイム区間のタグ補完（検索リアルタイム統合計画 S4）
// nvapi v2 search の応答にはタグが無いため、区間の動画（有界・通常数件〜数十件）の
// タグ詳細（isLocked 含む）を watch v3_guest から並列取得する。
// 実測: nvapi の /v1/videos/{id}/tags は全件404で死んでおり、v3_guest は
// Accept: */* で 200（Accept: application/json だと406）。1件 0.27〜0.34s。
// 検索応答のクリティカルパスには載せず、クライアントが結果表示後に非同期で呼ぶ。
import type { TagDetail } from '@/types/ranking'

export const REALTIME_TAGS_MAX_VIDEOS = 30
const DEFAULT_CONCURRENCY = 8
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 2500

const V3_GUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: '*/*',
  'Accept-Language': 'ja,en;q=0.9',
}

const VIDEO_ID_PATTERN = /^(sm|so|nm)\d{1,12}$/

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
  data?: { tag?: { items?: Array<{ name?: string; isLocked?: boolean }> } }
}

/** v3_guest の応答から TagDetail[] を取り出す（想定外の形なら空配列） */
export function parseTagDetails(payload: unknown): TagDetail[] {
  const items = (payload as V3GuestPayload | null)?.data?.tag?.items
  if (!Array.isArray(items)) return []
  return items
    .filter((t): t is { name: string; isLocked?: boolean } => typeof t?.name === 'string' && t.name.length > 0)
    .map((t) => ({ name: t.name, isLocked: t.isLocked === true }))
}

export interface RealtimeTagsResult {
  /** 取得できた動画のタグ詳細。失敗した動画は含めない（クライアント側で「未取得」扱い） */
  tagDetails: Record<string, TagDetail[]>
  failed: string[]
}

/**
 * 並列数を絞って v3_guest を叩き、タグ詳細を集める。
 * 1件でも失敗しても他は返す（部分成功）。
 */
export async function fetchTagDetailsForVideos(
  videoIds: string[],
  options: { fetchImpl?: typeof fetch; concurrency?: number; timeoutMs?: number } = {}
): Promise<RealtimeTagsResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const timeoutMs = options.timeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS
  const tagDetails: Record<string, TagDetail[]> = {}
  const failed: string[] = []

  const fetchOne = async (id: string): Promise<void> => {
    try {
      const res = await fetchImpl(buildV3GuestUrl(id), {
        headers: V3_GUEST_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        failed.push(id)
        return
      }
      tagDetails[id] = parseTagDetails(await res.json())
    } catch {
      failed.push(id)
    }
  }

  for (let i = 0; i < videoIds.length; i += concurrency) {
    await Promise.all(videoIds.slice(i, i + concurrency).map(fetchOne))
  }
  return { tagDetails, failed }
}
