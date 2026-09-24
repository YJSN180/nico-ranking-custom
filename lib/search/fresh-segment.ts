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
 */
async function fetchKindPages(
  kind: NicoPageKind,
  query: string,
  boundaryMs: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<{ videos: NicoPageVideo[]; truncatedAt?: string }> {
  const first = await fetchNicoSearchPage(kind, query, 1, fetchImpl, FRESH_TIMEOUT_MS, signal)
  if (!isSaturated(first, boundaryMs)) return { videos: first.items }
  const rest = await Promise.allSettled(
    Array.from({ length: FRESH_MAX_PAGES - 1 }, (_, i) => fetchNicoSearchPage(kind, query, i + 2, fetchImpl, FRESH_TIMEOUT_MS, signal))
  )
  const pages = [first]
  for (const result of rest) {
    if (result.status !== 'fulfilled') break
    pages.push(result.value)
  }
  const videos = pages.flatMap((page) => page.items)
  return isSaturated(pages[pages.length - 1], boundaryMs) ? { videos, truncatedAt: oldestRegisteredAt(videos) } : { videos }
}

/**
 * 本家ページの 1 ページ目を取り、境界以降の動画だけを RankingItem にして返す（60 秒メモリキャッシュ）。
 * 条件が対象外なら空。失敗は throw する。
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
    const results = await Promise.all(kinds.map((kind) => fetchKindPages(kind, query.query, boundaryMs, fetchImpl, options.signal)))
    const seen = new Set<string>()
    items = results
      .flatMap((result) => result.videos)
      .filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)))
      .map((v, i) => mapNvapiVideoToRankingItem(toNvapiVideo(v), i + 1))
    kinds.forEach((kind, i) => {
      const at = results[i]?.truncatedAt
      if (at) truncatedAt[isShortsKind(kind) ? 'short' : 'long'] = at
    })
    if (cache.size >= FRESH_CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { at: now, items, truncatedAt })
  }
  const newer = items.filter((it) => it.registeredAt !== undefined && new Date(it.registeredAt).getTime() >= boundaryMs)
  return { items: applyRealtimeRangeFilters(applyDateFilters(newer, conditions), conditions), truncatedAt }
}

/** 最新区間を nvapi のリアルタイム区間に併合する（ID で重複除外、投稿時刻の降順、rank 振り直し） */
export function mergeFreshIntoRealtime(fresh: RankingItem[], realtime: RankingItem[]): { items: RankingItem[]; added: number } {
  const known = new Set(realtime.map((it) => it.id))
  const added = fresh.filter((it) => !known.has(it.id))
  const merged = [...realtime, ...added].sort((a, b) => (b.registeredAt ?? '').localeCompare(a.registeredAt ?? ''))
  return { items: merged.map((it, i) => ({ ...it, rank: i + 1 })), added: added.length }
}
