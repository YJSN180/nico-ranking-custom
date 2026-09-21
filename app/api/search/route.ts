// 詳細検索API（検索リアルタイム統合計画 S3）
// Snapshot 検索API v2（毎朝5時時点のインデックス・強力なフィルタ）を基本とし、
// 条件がマージ可能なときは「直近5:00以降」の区間だけを nvapi v2（リアルタイム）から
// 取得して先頭に連結する。両APIとも CORS 非対応のためサーバー側で呼び出し、
// あわせてサイト側の粗悪コンテンツ除外ルールと管理者NGリストを適用する。
import { NextRequest, NextResponse } from 'next/server'
import {
  buildSnapshotSearchUrl,
  fetchSnapshotNewestStartTime,
  mapSnapshotVideoToRankingItem,
  parseSearchConditions,
  SEARCH_PAGE_SIZE,
  type SearchConditions,
  type SnapshotSearchResponse,
} from '@/lib/search/snapshot-search'
import {
  assembleMergedPage,
  fetchRealtimeSegment,
  getRealtimeBoundary,
  isRealtimeCandidate,
  isRealtimeMergeable,
  parseRequestedBoundary,
  planMergedPage,
  resolveRealtimeBoundary,
  type RealtimeSegment,
} from '@/lib/search/realtime-search'
import { applyExclusionRules } from '@/lib/search/exclusion-rules'
import { fetchFreshItems, mergeFreshIntoRealtime } from '@/lib/search/fresh-segment'
import { isRealtimeEnabled } from '@/lib/search/realtime-search'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'
import type { RankingItem } from '@/types/ranking'

export const revalidate = 0

const FETCH_TIMEOUT_MS = 10000
/** リアルタイム区間取得の全体予算。超過時は Snapshot 単独に縮退する（プラットフォーム504より先に必ず効かせる） */
const REALTIME_BUDGET_MS = 4000

type SnapshotPage = { items: RankingItem[]; totalCount: number }
type SnapshotFailure = { error: string; status: number; detail?: string }

async function fetchSnapshotPage(
  conditions: SearchConditions,
  offset: number,
  limit: number,
  startTimeBefore?: string
): Promise<SnapshotPage | SnapshotFailure> {
  let response: Response
  try {
    response = await fetch(buildSnapshotSearchUrl(conditions, { offset, limit, startTimeBefore }), {
      headers: { 'User-Agent': 'nico-rank.com (Re:turn) search' },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    return { error: isTimeout ? 'search_timeout' : 'search_unreachable', status: 504 }
  }
  if (!response.ok) {
    // 503 はスナップショットAPIのメンテナンス中
    return response.status === 503
      ? { error: 'search_maintenance', status: 503 }
      : { error: 'search_upstream_error', status: 502 }
  }
  let payload: SnapshotSearchResponse
  try {
    payload = (await response.json()) as SnapshotSearchResponse
  } catch {
    return { error: 'search_invalid_response', status: 502 }
  }
  if (payload.meta.status !== 200 || !payload.data) {
    return { error: 'search_query_error', status: 400, detail: payload.meta.errorMessage }
  }
  return {
    items: payload.data.map((video, index) => mapSnapshotVideoToRankingItem(video, index, offset)),
    totalCount: payload.meta.totalCount ?? 0,
  }
}

const isFailure = (r: SnapshotPage | SnapshotFailure): r is SnapshotFailure => 'error' in r

export async function GET(request: NextRequest): Promise<NextResponse> {
  const conditions = parseSearchConditions(request.nextUrl.searchParams)
  const now = new Date()
  // 境界 T: 同じ条件で Snapshot の索引が実際に持つ最新の投稿時刻。2 ページ目以降はクライアントが
  // 前回応答の boundary を返すので、それを使ってページ間で一貫させる。取得に失敗したら従来の 05:00 JST
  let boundary = getRealtimeBoundary(now)
  let mergeable = false
  if (isRealtimeEnabled() && isRealtimeCandidate(conditions)) {
    const requested = parseRequestedBoundary(request.nextUrl.searchParams.get('boundary'), now)
    if (requested) {
      boundary = requested
    } else {
      try {
        boundary = resolveRealtimeBoundary({ newestSnapshotStartTime: await fetchSnapshotNewestStartTime(conditions), now })
      } catch {
        boundary = getRealtimeBoundary(now)
      }
    }
    mergeable = isRealtimeMergeable(conditions, boundary)
  }

  // ---- Snapshot 単独（従来どおり） ----
  if (!mergeable) {
    const snapshot = await fetchSnapshotPage(conditions, (conditions.page - 1) * SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE)
    if (isFailure(snapshot)) {
      return NextResponse.json({ error: snapshot.error, detail: snapshot.detail }, { status: snapshot.status })
    }
    return await respond(snapshot.items, snapshot.totalCount, conditions, {
      source: 'snapshot',
      boundary,
      realtimeCount: 0,
      // SWR を短めにして、自動NG・許可リストの反映遅れを 3 分以内に抑える
      cacheControl: 'public, s-maxage=60, stale-while-revalidate=120',
    })
  }

  // ---- マージ: リアルタイム区間 + Snapshot ----
  // Snapshot の offset はリアルタイム件数 R に依存する。2ページ目以降はクライアントが
  // 前回応答の realtimeCount を rtCount として送るので、それを仮の R として並列取得し、
  // 実際の R とずれて窓が足りない場合だけ取り直す（新着が増えた直後のみ発生）。
  const rtCountHint = Math.max(0, parseInt(request.nextUrl.searchParams.get('rtCount') ?? '0', 10) || 0)
  const provisional = planMergedPage(conditions.page, SEARCH_PAGE_SIZE, rtCountHint)

  // Snapshot 側は境界より前だけ（filters[startTime][lt]=T）を取り、nvapi 側（minRegisteredAt=T）と
  // 構成的に排他にする。これで dedup に頼らず offset 計算が厳密になり、ページ間の重複が起きない
  // 最新区間（本家ページ）は nvapi と並列に取り、失敗しても nvapi だけで続ける（隠れ依存にしない）
  const [realtimeResult, snapshotResult, freshResult] = await Promise.all([
    fetchRealtimeSegment(conditions, boundary, fetch, 4000, AbortSignal.timeout(REALTIME_BUDGET_MS)).then(
      (segment): { segment: RealtimeSegment; error?: undefined } => ({ segment }),
      (error: unknown): { segment?: undefined; error: string } => ({
        error: error instanceof Error ? error.message : 'realtime_error',
      })
    ),
    fetchSnapshotPage(conditions, provisional.snapshotOffset, SEARCH_PAGE_SIZE, boundary),
    fetchFreshItems(conditions, boundary).then(
      (items): { items: RankingItem[]; error?: undefined } => ({ items }),
      (error: unknown): { items: RankingItem[]; error: string } => ({ items: [], error: error instanceof Error ? error.message : 'fresh_error' })
    ),
  ])

  if (isFailure(snapshotResult)) {
    return NextResponse.json({ error: snapshotResult.error, detail: snapshotResult.detail }, { status: snapshotResult.status })
  }

  // リアルタイム側が落ちたら Snapshot 単独に縮退（source ラベルで可視化＝隠れフォールバックにしない）
  if (!realtimeResult.segment) {
    const snapshot =
      provisional.snapshotOffset === (conditions.page - 1) * SEARCH_PAGE_SIZE
        ? snapshotResult
        : await fetchSnapshotPage(conditions, (conditions.page - 1) * SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE)
    if (isFailure(snapshot)) {
      return NextResponse.json({ error: snapshot.error, detail: snapshot.detail }, { status: snapshot.status })
    }
    return await respond(snapshot.items, snapshot.totalCount, conditions, {
      source: 'snapshot',
      boundary,
      realtimeCount: 0,
      realtimeError: realtimeResult.error,
      cacheControl: 'public, s-maxage=30, stale-while-revalidate=60',
    })
  }

  const segment = realtimeResult.segment
  // 本家ページの最新動画（nvapi 未反映分）をリアルタイム区間に併合してから、ページを組み立てる
  const withFresh = mergeFreshIntoRealtime(freshResult.items, segment.items)
  const realtimeItems = withFresh.items
  const plan = planMergedPage(conditions.page, SEARCH_PAGE_SIZE, realtimeItems.length)
  let snapshotItems = snapshotResult.items
  // 仮の窓 [provisional.offset, +PAGE) が実際に必要な窓を覆っていなければ取り直す
  const covers =
    plan.snapshotLimit === 0 ||
    (plan.snapshotOffset >= provisional.snapshotOffset &&
      plan.snapshotOffset + plan.snapshotLimit <= provisional.snapshotOffset + SEARCH_PAGE_SIZE)
  if (!covers) {
    const refetched = await fetchSnapshotPage(conditions, plan.snapshotOffset, SEARCH_PAGE_SIZE, boundary)
    if (isFailure(refetched)) {
      return NextResponse.json({ error: refetched.error, detail: refetched.detail }, { status: refetched.status })
    }
    snapshotItems = refetched.items
  } else if (plan.snapshotOffset > provisional.snapshotOffset) {
    snapshotItems = snapshotItems.slice(plan.snapshotOffset - provisional.snapshotOffset)
  }

  const merged = assembleMergedPage(realtimeItems, snapshotItems, plan)
  return await respond(merged, realtimeItems.length + snapshotResult.totalCount, conditions, {
    source: 'merged',
    boundary,
    realtimeCount: realtimeItems.length,
    realtimeTruncated: segment.truncated,
    freshCount: withFresh.added,
    ...(freshResult.error ? { freshError: freshResult.error } : {}),
    cacheControl: 'public, s-maxage=30, stale-while-revalidate=60',
  })
}

interface RespondMeta {
  source: 'merged' | 'snapshot'
  boundary: string
  realtimeCount: number
  realtimeTruncated?: boolean
  /** 本家ページから足した最新動画の数（nvapi に未反映だった分） */
  freshCount?: number
  freshError?: string
  realtimeError?: string
  cacheControl: string
}

async function respond(
  items: RankingItem[],
  totalCount: number,
  conditions: SearchConditions,
  meta: RespondMeta
): Promise<NextResponse> {
  // サイト側の粗悪コンテンツ除外ルール → 管理者NGリスト（ランキングと同じKV上のリスト）
  // どちらもリアルタイム区間・Snapshot 区間の両方に同一適用される
  const { items: exclusionFiltered, excludedCount } = applyExclusionRules(items)
  const { filteredItems, filteredCount } = await filterRankingItemsServer(exclusionFiltered)
  // NGフィルタは rank を 1 から振り直すため、ページ内の通し番号に戻す
  const pageStart = (conditions.page - 1) * SEARCH_PAGE_SIZE
  const renumbered = filteredItems.map((it, i) => ({ ...it, rank: pageStart + i + 1 }))
  return NextResponse.json(
    {
      items: renumbered,
      totalCount,
      page: conditions.page,
      pageSize: SEARCH_PAGE_SIZE,
      excludedCount: excludedCount + filteredCount,
      source: meta.source,
      boundary: meta.boundary,
      realtimeCount: meta.realtimeCount,
      ...(meta.realtimeTruncated ? { realtimeTruncated: true } : {}),
      ...(meta.realtimeError ? { realtimeError: meta.realtimeError } : {}),
      ...(meta.freshCount !== undefined ? { freshCount: meta.freshCount } : {}),
      ...(meta.freshError ? { freshError: meta.freshError } : {}),
    },
    { headers: { 'Cache-Control': meta.cacheControl } }
  )
}
