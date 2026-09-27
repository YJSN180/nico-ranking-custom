// 新着区間のうち、要求されたページが占める部分を取る（検索の S-b）。
// 合成した一覧は「新着区間（境界以降・新しい順）」→「索引（境界より前）」の順に並ぶ。新着区間は
// nvapi の先頭ページと本家ページ（nvapi に未反映の最新）を合わせた頭と、nvapi の 2 ページ目以降の続きから成る。
// 範囲を後から当てない検索（期間と再生時間は nvapi で絞れる）は、区間の件数が nvapi の総数から決まるので、
// 深いページでも先頭のページとそのページが要るページだけを取ればよい（1 回の検索で nvapi へは 3 回まで）。
import type { RankingItem } from '@/types/ranking'
import { mergeFreshIntoRealtime, type FreshSegment } from './fresh-segment'
import {
  applyRealtimeRangeFilters,
  fetchNvapiPage,
  hasPostFilters,
  NVAPI_MAX_ITEMS,
  REALTIME_MAX_PAGES,
  REALTIME_PAGE_SIZE,
  type NvapiPage,
} from './realtime-search'
import type { SearchConditions } from './snapshot-search'

/** 本家ページ（最新区間）の取得結果。呼び出し側が nvapi と並列に取り始めて渡す */
export type FreshOutcome = { segment: FreshSegment; error?: undefined } | { segment?: undefined; error: string }

/** 新着区間のうち欠けうる投稿時刻の範囲 */
export interface RealtimeGap {
  from: string
  to: string
}

export interface RealtimeWindow {
  /** 新着区間の件数 R（合成した一覧では、索引が R 番目から始まる） */
  total: number
  /** 新着区間の [from, min(to, total)) の動画（新しい順） */
  items: RankingItem[]
  /** 本家ページから足した動画（nvapi に未反映の分）の数 */
  freshAdded: number
  /** 欠けうる範囲（複数あればまとめた範囲）。無ければ undefined */
  gap?: RealtimeGap
}

export interface RealtimeWindowInput {
  conditions: SearchConditions
  boundary: string
  /** 合成した一覧でこのページが占める [from, to) */
  from: number
  to: number
  fresh: Promise<FreshOutcome>
  fetchImpl?: typeof fetch
  /** nvapi 1 回のタイムアウト */
  timeoutMs?: number
  /** 区間全体の期限 */
  signal?: AbortSignal
}

const timeOf = (iso: string): number => new Date(iso).getTime()

/** 欠けうる範囲をまとめる（最も早い始まりから最も遅い終わりまで）。時刻の読めないものは除く */
function coverGaps(gaps: RealtimeGap[]): RealtimeGap | undefined {
  const valid = gaps.filter((gap) => Number.isFinite(timeOf(gap.from)) && Number.isFinite(timeOf(gap.to)))
  if (valid.length === 0) return undefined
  const from = valid.reduce((earliest, gap) => (timeOf(gap.from) < timeOf(earliest) ? gap.from : earliest), valid[0]?.from ?? '')
  const to = valid.reduce((latest, gap) => (timeOf(gap.to) > timeOf(latest) ? gap.to : latest), valid[0]?.to ?? '')
  return { from, to }
}

/**
 * 新着区間の件数と、このページが占める部分を返す。nvapi の失敗は throw（呼び出し側で索引だけに縮退する）。
 * ショートだけの検索は本家ページだけが取得元なので、その失敗も throw する。
 */
export async function fetchRealtimeWindow(input: RealtimeWindowInput): Promise<RealtimeWindow> {
  const { conditions, boundary, from, to } = input
  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = input.timeoutMs ?? 4000

  // nvapi の動画検索はショート（ss）を返さない。ショートだけの検索では本家ページだけが新着区間になる
  if (conditions.contentType === 'short') {
    const fresh = await input.fresh
    if (fresh.error !== undefined) throw new Error(fresh.error)
    const { items } = mergeFreshIntoRealtime(fresh.segment.items, [])
    const shortFloor = fresh.segment.truncatedAt.short
    const gap = shortFloor ? coverGaps([{ from: boundary, to: shortFloor }]) : undefined
    return { total: items.length, items: items.slice(from, to), freshAdded: items.length, ...(gap ? { gap } : {}) }
  }

  const fetchPage = (page: number): Promise<NvapiPage> => fetchNvapiPage(conditions, boundary, page, fetchImpl, timeoutMs, input.signal)
  const [first, freshOutcome] = await Promise.all([fetchPage(1), input.fresh])
  const fresh: FreshSegment = freshOutcome.segment ?? { items: [], truncatedAt: {} }
  const gaps: RealtimeGap[] = []

  // 長尺の本家ページが境界まで届かず、nvapi の最新がそれより古いときは、そのあいだの投稿が欠けうる（nvapi の索引の遅れ）
  const longFloor = fresh.truncatedAt.long
  if (longFloor !== undefined) {
    const newestIndexed = first.items[0]?.registeredAt
    if (newestIndexed === undefined || timeOf(newestIndexed) < timeOf(longFloor)) gaps.push({ from: newestIndexed ?? boundary, to: longFloor })
  }
  // ショートは本家ページだけが取得元。読み足しの上限で境界まで届かなければ、境界からそこまでが欠けうる
  if (fresh.truncatedAt.short) gaps.push({ from: boundary, to: fresh.truncatedAt.short })

  if (hasPostFilters(conditions)) {
    // 再生数などの範囲は後から当てるので、区間の中の位置は先頭から読まないと決まらない。
    // どのページでも同じ位置になるよう、先頭から REALTIME_MAX_PAGES ページまでを読む（それより古い分は gap で知らせる）
    const raw = [...first.items]
    let hasNext = first.hasNext && first.items.length > 0
    for (let page = 2; page <= REALTIME_MAX_PAGES && hasNext; page++) {
      const next = await fetchPage(page)
      raw.push(...next.items)
      hasNext = next.hasNext && next.items.length > 0
    }
    const oldestRead = raw[raw.length - 1]?.registeredAt
    if (hasNext && oldestRead) gaps.push({ from: boundary, to: oldestRead })
    const seen = new Set<string>()
    const unique = raw.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
    const merged = mergeFreshIntoRealtime(fresh.items, unique)
    const list = applyRealtimeRangeFilters(merged.items, conditions)
    const gap = coverGaps(gaps)
    return { total: list.length, items: list.slice(from, to), freshAdded: merged.added, ...(gap ? { gap } : {}) }
  }

  // 範囲を後から当てない。頭（nvapi の先頭ページ＋本家ページで足した分）の後は、nvapi の並びがそのまま続く
  const head = mergeFreshIntoRealtime(fresh.items, first.items)
  const headIndexed = first.items.length
  const reachable = first.hasNext ? Math.min(Math.max(first.totalCount ?? 0, headIndexed), NVAPI_MAX_ITEMS) : headIndexed
  const total = head.items.length + Math.max(0, reachable - headIndexed)
  const end = Math.min(to, total)
  /** 区間の i 番目（頭より後）が nvapi の並びで何番目か */
  const indexedAt = (i: number): number => i - head.items.length + headIndexed
  const pageOf = (indexed: number): number => Math.floor(indexed / REALTIME_PAGE_SIZE) + 1
  const pages = new Set<number>()
  for (let i = Math.max(from, head.items.length); i < end; i++) pages.add(pageOf(indexedAt(i)))
  // nvapi が返せる深さを超える新着があるときは、区間の終わりに届くページで、欠ける範囲の終わり（取れる中で最も古い投稿）を知らせる
  const depthCapped = first.hasNext && (first.totalCount ?? 0) > NVAPI_MAX_ITEMS && to >= total
  const lastPage = Math.ceil(NVAPI_MAX_ITEMS / REALTIME_PAGE_SIZE)
  if (depthCapped) pages.add(lastPage)
  pages.delete(1)
  const fetched = new Map<number, NvapiPage>([[1, first]])
  await Promise.all(
    Array.from(pages, async (page) => {
      fetched.set(page, await fetchPage(page))
    })
  )

  // 取得中に新着が入るとページがずれて、同じ動画がもう一度来る。動画 ID で 1 件にまとめる
  const seen = new Set(head.items.map((it) => it.id))
  const items: RankingItem[] = []
  for (let i = from; i < end; i++) {
    const headItem = head.items[i]
    if (headItem) {
      items.push(headItem)
      continue
    }
    const indexed = indexedAt(i)
    const item = fetched.get(pageOf(indexed))?.items[indexed % REALTIME_PAGE_SIZE]
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }
  if (depthCapped) {
    const last = fetched.get(lastPage)?.items
    const oldestReachable = last?.[last.length - 1]?.registeredAt
    if (oldestReachable) gaps.push({ from: boundary, to: oldestReachable })
  }
  const gap = coverGaps(gaps)
  // 期間・再生時間は nvapi が絞っている。本家ページの分は取得時に絞っている。念のため同じ条件を当てる
  return { total, items: applyRealtimeRangeFilters(items, conditions), freshAdded: head.added, ...(gap ? { gap } : {}) }
}
