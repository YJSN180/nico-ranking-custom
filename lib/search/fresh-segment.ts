// 最新区間: 本家 www.nicovideo.jp の検索/タグページ（投稿日時が新しい順）の 1 ページ目を、
// nvapi のリアルタイム区間に併合する。nvapi の索引は投稿から数十分〜数時間遅れるが、
// 本家ページには投稿から数分の動画まで載る（2026-09-22 実測）。
// 失敗（HTTP エラー・構造変化）は呼び出し側で無視し、nvapi だけの結果に静かに戻す。
import type { RankingItem } from '@/types/ranking'
import { fetchNicoSearchPage, isShortsKind, shortsKindOf, type NicoPageKind, type NicoPageResult, type NicoPageVideo } from './nico-page-search'
import { applyRealtimeRangeFilters, freshQueryFor, mapNvapiVideoToRankingItem, type NvapiVideo } from './realtime-search'
import type { SearchConditions } from './snapshot-search'

export const FRESH_CACHE_TTL_MS = 60_000
const FRESH_CACHE_MAX = 200
const FRESH_TIMEOUT_MS = 3000
/**
 * 1 ページ目（32 件）が丸ごと境界より新しいときだけ読み足す上限ページ数。
 * ショートは nvapi に無いので本家ページだけが区間の供給源になり、連投があると 1 ページに収まらない
 */
export const FRESH_MAX_PAGES = 3

function toNvapiVideo(v: NicoPageVideo): NvapiVideo {
  const owner = v.owner ?? undefined
  return {
    id: v.id,
    title: v.title,
    registeredAt: v.registeredAt,
    duration: v.duration,
    thumbnail: v.thumbnail,
    count: v.count,
    owner: owner ? { id: owner.id ?? undefined, name: owner.name ?? undefined, iconUrl: owner.iconUrl ?? undefined, ownerType: owner.ownerType } : undefined,
    isChannelVideo: v.isChannelVideo,
  }
}

function applyDateFilters(items: RankingItem[], c: SearchConditions): RankingItem[] {
  const from = c.dateFrom ? new Date(c.dateFrom).getTime() : null
  const to = c.dateTo ? new Date(c.dateTo).getTime() : null
  if (from === null && to === null) return items
  return items.filter((it) => {
    const t = it.registeredAt ? new Date(it.registeredAt).getTime() : Number.NaN
    if (!Number.isFinite(t)) return false
    return (from === null || t >= from) && (to === null || t <= to)
  })
}

/** 最新区間。items は境界以降の動画（範囲・日付の後付けフィルタ済み） */
export interface FreshSegment {
  items: RankingItem[]
  /**
   * 読み足しの上限（FRESH_MAX_PAGES）や途中のページの失敗で、境界まで届かなかった動画の種類と、
   * 取れた中で最も古い投稿時刻。境界からこの時刻までの投稿は欠けうる
   */
  truncatedAt: { long?: string; short?: string }
  /** 動画とショートの両方を取る検索で、片方だけ取れなかったときの失敗（取れた方の動画は items に入る） */
  error?: string
}

interface CacheEntry {
  at: number
  items: RankingItem[]
  truncatedAt: FreshSegment['truncatedAt']
}
const cache = new Map<string, CacheEntry>()

export function clearFreshCache(): void {
  cache.clear()
}

// 境界以降（境界ちょうどを含む）。索引側は境界より前だけを持つので重ならず、重なっても動画 ID で除かれる
const isAtOrAfter = (boundaryMs: number) => (v: NicoPageVideo): boolean => new Date(v.registeredAt).getTime() >= boundaryMs

/** ページが境界まで届かず続きがある（全件が境界以降で、次のページがある） */
const isSaturated = (page: NicoPageResult, boundaryMs: number): boolean =>
  page.hasNext && page.items.length > 0 && page.items.every(isAtOrAfter(boundaryMs))

const oldestRegisteredAt = (videos: NicoPageVideo[]): string | undefined =>
  videos.reduce<NicoPageVideo | undefined>(
    (oldest, v) => (oldest === undefined || new Date(v.registeredAt).getTime() < new Date(oldest.registeredAt).getTime() ? v : oldest),
    undefined
  )?.registeredAt

/**
 * 種別ごとに 1 ページ目を取り、全件が境界以降で続きがあるときだけ 2〜FRESH_MAX_PAGES ページ目を並列に読み足す。
 * 読み足しは途中のページが取れなければそこまでにする（穴のあいた区間を返さない）。1 ページ目の失敗は throw。
 * 最後に使ったページもまだ境界に届いていなければ、取れた中で最も古い投稿時刻を truncatedAt に返す。
 * 読み足しに失敗したときは partial（キャッシュしない。次の検索で取り直す）
 */
async function fetchKindPages(
  kind: NicoPageKind,
  query: string,
  boundaryMs: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<{ videos: NicoPageVideo[]; truncatedAt?: string; partial: boolean }> {
  const first = await fetchNicoSearchPage(kind, query, 1, fetchImpl, FRESH_TIMEOUT_MS, signal)
  if (!isSaturated(first, boundaryMs)) return { videos: first.items, partial: false }
  const rest = await Promise.allSettled(
    Array.from({ length: FRESH_MAX_PAGES - 1 }, (_, i) => fetchNicoSearchPage(kind, query, i + 2, fetchImpl, FRESH_TIMEOUT_MS, signal))
  )
  const pages = [first]
  let partial = false
  for (const result of rest) {
    if (result.status !== 'fulfilled') {
      partial = true
      break
    }
    pages.push(result.value)
  }
  const videos = pages.flatMap((page) => page.items)
  const truncatedAt = isSaturated(pages[pages.length - 1], boundaryMs) ? oldestRegisteredAt(videos) : undefined
  return { videos, partial, ...(truncatedAt ? { truncatedAt } : {}) }
}

const errorMessage = (reason: unknown): string => (reason instanceof Error ? reason.message : 'fresh_error')

/**
 * 本家ページの 1 ページ目を取り、境界以降の動画だけを RankingItem にして返す（60 秒メモリキャッシュ）。
 * 条件が対象外なら空。取る種類がすべて失敗したら throw し、一部だけ失敗したら取れた分と error を返す。
 * 失敗を含む結果はキャッシュしない（穴のあいた区間を使い回さず、次の検索で取り直す）。
 */
export async function fetchFreshSegment(
  conditions: SearchConditions,
  boundary: string,
  /** signal は呼び出し全体の期限（任意）。ページごとのタイムアウトと早い方で打ち切る */
  options: { fetchImpl?: typeof fetch; now?: number; signal?: AbortSignal } = {}
): Promise<FreshSegment> {
  const query = freshQueryFor(conditions)
  if (!query) return { items: [], truncatedAt: {} }
  const boundaryMs = new Date(boundary).getTime()
  // 動画の種類ごと・境界ごとに別キャッシュ（取るページの組み合わせと読み足しの要否が違う）
  const key = `${conditions.contentType}:${query.kind}:${query.query}:${boundary}`
  const now = options.now ?? Date.now()
  const cached = cache.get(key)
  let items: RankingItem[]
  let truncatedAt: FreshSegment['truncatedAt'] = {}
  let error: string | undefined
  if (cached && now - cached.at < FRESH_CACHE_TTL_MS) {
    items = cached.items
    truncatedAt = cached.truncatedAt
  } else {
    // 動画（/search, /tag）とショート（/search_shorts, /tag_shorts）を並列に取る。
    // Snapshot 区間にはショートも含まれるので、最新区間でも同じく含める。動画の種類で絞る検索では該当する種別だけ
    const fetchImpl = options.fetchImpl ?? fetch
    const kinds: NicoPageKind[] =
      conditions.contentType === 'long'
        ? [query.kind]
        : conditions.contentType === 'short'
          ? [shortsKindOf(query.kind)]
          : [query.kind, shortsKindOf(query.kind)]
    // 種類ごとに独立して扱う（ショートのページが落ちても、取れた動画の最新は使う）
    const settled = await Promise.allSettled(kinds.map((kind) => fetchKindPages(kind, query.query, boundaryMs, fetchImpl, options.signal)))
    const failure = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure && settled.every((result) => result.status === 'rejected')) throw failure.reason
    error = failure ? errorMessage(failure.reason) : undefined
    const seen = new Set<string>()
    let partial = failure !== undefined
    const videos: NicoPageVideo[] = []
    settled.forEach((result, i) => {
      const kind = kinds[i]
      if (result.status !== 'fulfilled' || kind === undefined) return
      videos.push(...result.value.videos)
      if (result.value.partial) partial = true
      if (result.value.truncatedAt) truncatedAt[isShortsKind(kind) ? 'short' : 'long'] = result.value.truncatedAt
    })
    items = videos
      .filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)))
      .map((v, i) => mapNvapiVideoToRankingItem(toNvapiVideo(v), i + 1))
    if (!partial) {
      if (cache.size >= FRESH_CACHE_MAX) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(key, { at: now, items, truncatedAt })
    }
  }
  const newer = items.filter((it) => it.registeredAt !== undefined && new Date(it.registeredAt).getTime() >= boundaryMs)
  return { items: applyRealtimeRangeFilters(applyDateFilters(newer, conditions), conditions), truncatedAt, ...(error ? { error } : {}) }
}

/** 投稿時刻（ミリ秒）。不明・不正な値は最も古い扱い */
const postedAt = (item: RankingItem): number => {
  const t = item.registeredAt ? new Date(item.registeredAt).getTime() : Number.NaN
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY
}

/** 最新区間を nvapi のリアルタイム区間に併合する（ID で重複除外、投稿時刻の降順、rank 振り直し） */
export function mergeFreshIntoRealtime(fresh: RankingItem[], realtime: RankingItem[]): { items: RankingItem[]; added: number } {
  const known = new Set(realtime.map((it) => it.id))
  const added = fresh.filter((it) => !known.has(it.id))
  // 時刻の表記（+09:00 / Z）によらず時刻で並べる。同時刻は nvapi 側を先にする（安定ソート）
  const merged = [...realtime, ...added].sort((a, b) => {
    const diff = postedAt(b) - postedAt(a)
    return Number.isNaN(diff) ? 0 : diff
  })
  return { items: merged.map((it, i) => ({ ...it, rank: i + 1 })), added: added.length }
}
