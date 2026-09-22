// 最新区間: 本家 www.nicovideo.jp の検索/タグページ（投稿日時が新しい順）の 1 ページ目を、
// nvapi のリアルタイム区間に併合する。nvapi の索引は投稿から数十分〜数時間遅れるが、
// 本家ページには投稿から数分の動画まで載る（2026-09-22 実測）。
// 失敗（HTTP エラー・構造変化）は呼び出し側で無視し、nvapi だけの結果に静かに戻す。
import type { RankingItem } from '@/types/ranking'
import { fetchNicoSearchPage, shortsKindOf, type NicoPageKind, type NicoPageVideo } from './nico-page-search'
import { applyRealtimeRangeFilters, mapNvapiVideoToRankingItem, type NvapiVideo } from './realtime-search'
import type { SearchConditions } from './snapshot-search'

export const FRESH_CACHE_TTL_MS = 60_000
const FRESH_CACHE_MAX = 200
const FRESH_TIMEOUT_MS = 3000

export interface FreshQuery {
  kind: 'keyword' | 'tag'
  query: string
}

/**
 * 本家ページの URL で表せる条件だけを対象にする。
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

interface CacheEntry {
  at: number
  items: RankingItem[]
}
const cache = new Map<string, CacheEntry>()

export function clearFreshCache(): void {
  cache.clear()
}

/**
 * 本家ページの 1 ページ目を取り、境界より新しい動画だけを RankingItem にして返す（60 秒メモリキャッシュ）。
 * 条件が対象外なら空配列。失敗は throw する。
 */
export async function fetchFreshItems(
  conditions: SearchConditions,
  boundary: string,
  options: { fetchImpl?: typeof fetch; now?: number } = {}
): Promise<RankingItem[]> {
  const query = freshQueryFor(conditions)
  if (!query) return []
  // 動画の種類ごとに別キャッシュ（取るページの組み合わせが違う）
  const key = `${conditions.contentType}:${query.kind}:${query.query}`
  const now = options.now ?? Date.now()
  const cached = cache.get(key)
  let items: RankingItem[]
  if (cached && now - cached.at < FRESH_CACHE_TTL_MS) {
    items = cached.items
  } else {
    // 動画（/search, /tag）とショート（/search_shorts, /tag_shorts）の 1 ページ目を並列に取る。
    // Snapshot 区間にはショートも含まれるので、最新区間でも同じく含める。動画の種類で絞る検索では該当する種別だけ
    const fetchImpl = options.fetchImpl ?? fetch
    const kinds: NicoPageKind[] =
      conditions.contentType === 'long'
        ? [query.kind]
        : conditions.contentType === 'short'
          ? [shortsKindOf(query.kind)]
          : [query.kind, shortsKindOf(query.kind)]
    const pages = await Promise.all(kinds.map((kind) => fetchNicoSearchPage(kind, query.query, 1, fetchImpl, FRESH_TIMEOUT_MS)))
    const seen = new Set<string>()
    items = pages
      .flatMap((page) => page.items)
      .filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)))
      .map((v, i) => mapNvapiVideoToRankingItem(toNvapiVideo(v), i + 1))
    if (cache.size >= FRESH_CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { at: now, items })
  }
  const boundaryMs = new Date(boundary).getTime()
  const newer = items.filter((it) => it.registeredAt !== undefined && new Date(it.registeredAt).getTime() > boundaryMs)
  return applyRealtimeRangeFilters(applyDateFilters(newer, conditions), conditions)
}

/** 最新区間を nvapi のリアルタイム区間に併合する（ID で重複除外、投稿時刻の降順、rank 振り直し） */
export function mergeFreshIntoRealtime(fresh: RankingItem[], realtime: RankingItem[]): { items: RankingItem[]; added: number } {
  const known = new Set(realtime.map((it) => it.id))
  const added = fresh.filter((it) => !known.has(it.id))
  const merged = [...realtime, ...added].sort((a, b) => (b.registeredAt ?? '').localeCompare(a.registeredAt ?? ''))
  return { items: merged.map((it, i) => ({ ...it, rank: i + 1 })), added: added.length }
}
