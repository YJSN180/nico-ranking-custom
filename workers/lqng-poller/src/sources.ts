// 外部データ源（nvapi 新着検索 / getthumbinfo / ユーザー情報 API / Snapshot）
// poll.ts からは PollDeps インターフェース越しに使い、テストではモックに差し替える。
import type { OwnerVisibility } from '../../../lib/lqng/types'
import { fetchNicoSearchPage, nicoPageOwnerId, NICO_PAGE_SIZE, type NicoPageKind, type NicoPageResult, type NicoPageVideo } from '../../../lib/search/nico-page-search'
import type { TagDetail } from '../../../types/ranking'

export interface SourceVideo {
  id: string
  title: string
  authorId: string | null
  registeredAt: string
  ownerVisibility: OwnerVisibility | null
}

export interface ThumbInfo {
  tagDetails: TagDetail[]
  /** user_id / ch_id が空なら hidden */
  ownerVisibility: OwnerVisibility
  nickname: string | null
}

/**
 * 失敗の種類: deleted = 動画が削除済み、error = その動画について確かな失敗（試行回数に数える）、
 * unavailable = 5xx・429・通信失敗など上流の一時的な不調（試行回数に数えない）
 */
export type ThumbResult = { ok: true; info: ThumbInfo } | { ok: false; reason: 'deleted' | 'error' | 'unavailable' }

export interface UserInfo {
  status: 'existing' | 'deleted' | 'error'
  followerCount: number | null
  nickname: string | null
}

/** アクセス制限（403）。呼び出し側は即中断して次回に持ち越す */
export class AccessLimitedError extends Error {
  constructor(source: string) {
    super(`access limited: ${source}`)
    this.name = 'AccessLimitedError'
  }
}

/** 新着の主経路（本家タグページ）の結果。取れたページの動画と、取れなかったページ */
export interface NewVideosResult {
  videos: SourceVideo[]
  /** 取れなかったページ（タグは名前でなく設定の並び順の番号で表す。例: t0:tag_shorts:p1 nico_page_http_503） */
  failures: string[]
}

export interface PollDeps {
  now: () => Date
  /** 新着の主経路（本家のタグページ）。全ページ失敗したときだけ投げ、fetchNewVideosFallback（nvapi）へ */
  fetchNewVideos: (tags: string[], sinceIso: string) => Promise<NewVideosResult>
  fetchNewVideosFallback?: (tags: string[], sinceIso: string) => Promise<SourceVideo[]>
  fetchThumbInfo: (videoId: string) => Promise<ThumbResult>
  fetchUserInfo: (userId: string) => Promise<UserInfo>
  fetchSweepVideos: (genre: string, dateJst: string) => Promise<SourceVideo[]>
  /** 実行は続けるが監視に上げたい失敗（主経路と予備の両方で新着を取れなかったなど） */
  reportError?: (error: unknown, context: string) => void
}

const NVAPI_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: '*/*',
  'Accept-Language': 'ja,en;q=0.9',
  'X-Frontend-Id': '6',
  'X-Frontend-Version': '0',
  Referer: 'https://www.nicovideo.jp/',
}

const NVAPI_SEARCH_URL = 'https://nvapi.nicovideo.jp/v2/search/video'
const NVAPI_USER_URL = 'https://nvapi.nicovideo.jp/v1/users/'
const THUMB_URL = 'https://ext.nicovideo.jp/api/getthumbinfo/'
const SNAPSHOT_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
const PAGE_SIZE = 100
export const SNAPSHOT_PAGE_SIZE = PAGE_SIZE
const MAX_PAGES = 3
const TIMEOUT_MS = 8000

interface NvapiItem {
  id?: string
  title?: string
  registeredAt?: string
  isChannelVideo?: boolean
  owner?: { id?: string | number | null; ownerType?: string; visibility?: string; name?: string | null } | null
}

function mapNvapiItem(item: NvapiItem): SourceVideo | null {
  if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.registeredAt !== 'string') return null
  const owner = item.owner ?? null
  const isChannel = item.isChannelVideo === true || owner?.ownerType === 'channel'
  // チャンネルの owner.id は "123" でも "ch123" でも来るので、本家ページと同じ規則で channel/chNNN にそろえる
  const authorId = nicoPageOwnerId({ id: item.id, title: item.title, registeredAt: item.registeredAt, owner, isChannelVideo: item.isChannelVideo })
  const hidden = owner?.visibility === 'hidden' || (owner !== null && !owner.name && !isChannel)
  return { id: item.id, title: item.title, authorId, registeredAt: item.registeredAt, ownerVisibility: owner === null ? null : hidden ? 'hidden' : 'visible' }
}

/** 本家タグページの 1 件を SourceVideo にする */
function mapNicoPageVideo(v: NicoPageVideo): SourceVideo {
  const owner = v.owner ?? null
  const hidden = owner?.visibility === 'hidden'
  return { id: v.id, title: v.title, authorId: nicoPageOwnerId(v), registeredAt: v.registeredAt, ownerVisibility: owner === null ? null : hidden ? 'hidden' : 'visible' }
}

export const NICO_PAGES_PER_TAG = 2
/** タグごとに読む種別: 通常の動画（/tag）とショート（/tag_shorts、ss で始まる ID） */
export const NICO_PAGE_KINDS: readonly NicoPageKind[] = ['tag', 'tag_shorts']

/**
 * 本家のタグページ（投稿日時が新しい順）から since 以降の新着を集める。nvapi の検索索引より反映が早く、
 * nvapi の動画検索には無いショート（ss）も /tag_shorts から拾える。
 * タグ×種別ごとに 1 ページ、ページ末尾まで since より新しい動画が続くときだけ 2 ページ目まで読む。
 * 同じ動画が複数タグに出ても 1 回だけ返す。
 * 失敗はタグ×種別ごとに扱い、取れたページの分は返す（ショートだけ失敗しても nvapi には縮退しない）。
 * 403（アクセス制限）に当たったら残りのページは読まない。全ページ失敗したときだけ throw（呼び出し側で nvapi に縮退）。
 */
export async function fetchNewVideosFromNicoPages(tags: string[], sinceIso: string, fetchImpl: typeof fetch = fetch): Promise<NewVideosResult> {
  const sinceMs = new Date(sinceIso).getTime()
  const seen = new Set<string>()
  const out: SourceVideo[] = []
  const failures: string[] = []
  let succeeded = 0
  let limited = false
  for (const [tagIndex, tag] of tags.entries()) {
    for (const kind of NICO_PAGE_KINDS) {
      for (let page = 1; page <= NICO_PAGES_PER_TAG && !limited; page++) {
        let result: NicoPageResult
        try {
          result = await fetchNicoSearchPage(kind, tag, page, fetchImpl, TIMEOUT_MS)
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'error'
          failures.push(`t${tagIndex}:${kind}:p${page} ${reason}`)
          limited = reason === 'nico_page_http_403'
          break
        }
        succeeded++
        let reachedSince = false
        for (const item of result.items) {
          if (new Date(item.registeredAt).getTime() < sinceMs) {
            reachedSince = true
            break
          }
          if (seen.has(item.id)) continue
          seen.add(item.id)
          out.push(mapNicoPageVideo(item))
        }
        if (reachedSince || !result.hasNext || result.items.length < NICO_PAGE_SIZE) break
      }
    }
  }
  if (succeeded === 0 && failures.length > 0) throw new Error(`nico_pages_failed: ${failures.join('; ')}`)
  return { videos: out.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)), failures }
}

/** nvapi 新着検索: タグ OR、投稿日時の新しい順、since 以降を最大 3 ページ（本家ページが使えないときの予備） */
export async function fetchNewVideosFromNvapi(tags: string[], sinceIso: string, fetchImpl: typeof fetch = fetch): Promise<SourceVideo[]> {
  const out: SourceVideo[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      tag: tags.join(' OR '),
      sortKey: 'registeredAt',
      sortOrder: 'desc',
      pageSize: String(PAGE_SIZE),
      page: String(page),
      minRegisteredAt: sinceIso,
      _frontendId: '6',
    })
    const res = await fetchImpl(`${NVAPI_SEARCH_URL}?${params.toString()}`, { headers: NVAPI_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 403) throw new AccessLimitedError('nvapi')
    if (!res.ok) throw new Error(`nvapi_http_${res.status}`)
    const json = (await res.json()) as { meta?: { status?: number }; data?: { items?: NvapiItem[]; hasNext?: boolean } }
    if (json.meta?.status !== 200 || !json.data) throw new Error('nvapi_invalid_response')
    const items = json.data.items ?? []
    for (const item of items) {
      const mapped = mapNvapiItem(item)
      if (mapped) out.push(mapped)
    }
    if (!json.data.hasNext || items.length === 0) break
  }
  return out
}

// 1 パスで復号する（&amp; を先に戻す逐次 replace は &amp;lt; → < の二重復号になる）
const XML_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['#39', "'"],
])
const decodeXml = (s: string): string =>
  s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (match, name: string) => XML_ENTITIES.get(name) ?? match)

function pickXml(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? decodeXml(m[1]!) : undefined
}

/** getthumbinfo: ロック付きタグと投稿者。削除済み動画は status=fail、アクセス制限は 403 */
export async function fetchThumbInfoFromExt(videoId: string, fetchImpl: typeof fetch = fetch): Promise<ThumbResult> {
  const res = await fetchImpl(`${THUMB_URL}${videoId}`, { headers: { 'User-Agent': 'nico-rank.com lqng-poller' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 403) throw new AccessLimitedError('getthumbinfo')
  if (res.status >= 500 || res.status === 429) return { ok: false, reason: 'unavailable' }
  if (!res.ok) return { ok: false, reason: 'error' }
  const xml = await res.text()
  const status = xml.match(/<nicovideo_thumb_response status="(\w+)"/)?.[1]
  if (status !== 'ok') return { ok: false, reason: pickXml(xml, 'code') === 'DELETED' ? 'deleted' : 'error' }
  const tagDetails: TagDetail[] = Array.from(xml.matchAll(/<tag(\s[^>]*)?>([\s\S]*?)<\/tag>/g)).map((m) => ({
    name: decodeXml(m[2]!),
    isLocked: /lock="1"/.test(m[1] ?? ''),
  }))
  const userId = pickXml(xml, 'user_id')
  const chId = pickXml(xml, 'ch_id')
  return {
    ok: true,
    info: {
      tagDetails,
      ownerVisibility: userId || chId ? 'visible' : 'hidden',
      nickname: pickXml(xml, 'user_nickname') ?? pickXml(xml, 'ch_name') ?? null,
    },
  }
}

/**
 * nvapi の 404 本文が「見つからない」（{"meta":{"status":404,"errorCode":"NOT_FOUND"}}）か。
 * CDN・プロキシのエラーページなど別の 404 を退会と取り違えないために確かめる。
 * なお存在しない API パスも同じ本文を返す（2026-09-25 実測）ので、API 変更で全員が 404 になる事態は
 * 呼び出し側の「404 の割合」の検査で止める。
 */
async function isNvapiNotFound(res: Response): Promise<boolean> {
  try {
    const json = JSON.parse(await res.text()) as { meta?: { status?: unknown; errorCode?: unknown } }
    return json.meta?.status === 404 && json.meta.errorCode === 'NOT_FOUND'
  } catch {
    return false
  }
}

/**
 * ユーザー情報 API: 本文まで NOT_FOUND の 404 を deleted（退会の観測）として返す。
 * 退会の確定（時間を置いた 2 回目）は呼び出し側が行う。channel/ 形式は対象外（存在扱い）
 */
export async function fetchUserInfoFromNvapi(userId: string, fetchImpl: typeof fetch = fetch): Promise<UserInfo> {
  if (!/^\d{1,12}$/.test(userId)) return { status: 'existing', followerCount: null, nickname: null }
  const res = await fetchImpl(`${NVAPI_USER_URL}${userId}`, { headers: NVAPI_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 404) return { status: (await isNvapiNotFound(res)) ? 'deleted' : 'error', followerCount: null, nickname: null }
  if (res.status === 403) throw new AccessLimitedError('nvapi-user')
  if (!res.ok) return { status: 'error', followerCount: null, nickname: null }
  const json = (await res.json()) as { data?: { user?: { nickname?: string; followerCount?: number } } }
  const user = json.data?.user
  if (!user) return { status: 'error', followerCount: null, nickname: null }
  return { status: 'existing', followerCount: typeof user.followerCount === 'number' ? user.followerCount : null, nickname: user.nickname ?? null }
}

interface SnapshotItem {
  contentId: string
  title: string
  userId: number | null
  channelId: number | null
  startTime: string
  /** 空白区切りのタグ名（fields に tags を含めたときだけ） */
  tags?: string | null
}

export interface SnapshotVideo extends SourceVideo {
  /** Snapshot が返すタグ名（ロック状態は含まない） */
  tags: string[]
}

export interface SnapshotPage {
  videos: SnapshotVideo[]
  totalCount: number
}

function mapSnapshotItem(v: SnapshotItem): SnapshotVideo {
  const authorId = v.channelId !== null && v.channelId !== undefined ? `channel/ch${v.channelId}` : v.userId !== null && v.userId !== undefined ? String(v.userId) : null
  const tags = typeof v.tags === 'string' ? v.tags.split(/\s+/).filter((t) => t.length > 0) : []
  return { id: v.contentId, title: v.title, authorId, registeredAt: v.startTime, ownerVisibility: null, tags }
}

/** Snapshot の filters[startTime] は +09:00 表記で渡す（Z 表記は使わない） */
export function toSnapshotTime(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 3600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}+09:00`
}

/**
 * Snapshot: 対象タグ（OR・完全一致）の [startIso, endIso) 区間を新しい順に 1 ページ（100 件）取る。
 * バックフィル用。ロック状態は含まないので D の候補絞り込みにだけタグ名を使う。
 */
export async function fetchSnapshotWindowPage(tags: string[], startIso: string, endIso: string, offset: number, fetchImpl: typeof fetch = fetch): Promise<SnapshotPage> {
  const params = new URLSearchParams({
    q: tags.join(' OR '),
    targets: 'tagsExact',
    fields: 'contentId,title,userId,channelId,startTime,tags',
    _sort: '-startTime',
    _limit: String(PAGE_SIZE),
    _offset: String(offset),
    'filters[startTime][gte]': toSnapshotTime(startIso),
    'filters[startTime][lt]': toSnapshotTime(endIso),
    _context: 'nico-rank.com lqng-poller',
  })
  const res = await fetchImpl(`${SNAPSHOT_URL}?${params.toString()}`, { headers: { 'User-Agent': 'nico-rank.com lqng-poller' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`snapshot_http_${res.status}`)
  const json = (await res.json()) as { meta?: { status?: number; totalCount?: number }; data?: SnapshotItem[] }
  if (json.meta?.status !== 200 || !json.data) throw new Error('snapshot_invalid_response')
  return { videos: json.data.map(mapSnapshotItem), totalCount: json.meta.totalCount ?? json.data.length }
}

/** Snapshot: 指定ジャンルの、JST 日付 dateJst（YYYY-MM-DD）に投稿された動画（最大 300 件） */
export async function fetchSweepVideosFromSnapshot(genre: string, dateJst: string, fetchImpl: typeof fetch = fetch): Promise<SourceVideo[]> {
  const out: SourceVideo[] = []
  // 翌日（JST）を暦上で求める。Date に +09:00 を食わせてから UTC 日付を取ると 1 日ずれるので文字列で計算する
  const [y, m, d] = dateJst.split('-').map(Number) as [number, number, number]
  const nextJst = `${new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)}T00:00:00+09:00`
  for (let offset = 0; offset < PAGE_SIZE * MAX_PAGES; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      q: genre,
      targets: 'genre',
      fields: 'contentId,title,userId,channelId,startTime',
      _sort: '-startTime',
      _limit: String(PAGE_SIZE),
      _offset: String(offset),
      'filters[startTime][gte]': `${dateJst}T00:00:00+09:00`,
      'filters[startTime][lt]': nextJst,
    })
    const res = await fetchImpl(`${SNAPSHOT_URL}?${params.toString()}`, { headers: { 'User-Agent': 'nico-rank.com lqng-poller' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`snapshot_http_${res.status}`)
    const json = (await res.json()) as { meta?: { status?: number; totalCount?: number }; data?: SnapshotItem[] }
    if (json.meta?.status !== 200 || !json.data) throw new Error('snapshot_invalid_response')
    for (const v of json.data) {
      const authorId = v.channelId !== null && v.channelId !== undefined ? `channel/ch${v.channelId}` : v.userId !== null && v.userId !== undefined ? String(v.userId) : null
      out.push({ id: v.contentId, title: v.title, authorId, registeredAt: v.startTime, ownerVisibility: null })
    }
    if (json.data.length < PAGE_SIZE || offset + PAGE_SIZE >= (json.meta.totalCount ?? 0)) break
  }
  return out
}

export function createLiveDeps(fetchImpl: typeof fetch = fetch): PollDeps {
  return {
    now: () => new Date(),
    fetchNewVideos: (tags, since) => fetchNewVideosFromNicoPages(tags, since, fetchImpl),
    fetchNewVideosFallback: (tags, since) => fetchNewVideosFromNvapi(tags, since, fetchImpl),
    fetchThumbInfo: (id) => fetchThumbInfoFromExt(id, fetchImpl),
    fetchUserInfo: (id) => fetchUserInfoFromNvapi(id, fetchImpl),
    fetchSweepVideos: (genre, date) => fetchSweepVideosFromSnapshot(genre, date, fetchImpl),
  }
}
