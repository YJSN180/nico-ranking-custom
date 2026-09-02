// 詳細検索API（検索リアルタイム統合計画 S3）
// Snapshot 検索API v2（毎朝5時時点のインデックス・強力なフィルタ）を基本とし、
// 条件がマージ可能なときは「直近5:00以降」の区間だけを nvapi v2（リアルタイム）から
// 取得して先頭に連結する。両APIとも CORS 非対応のためサーバー側で呼び出し、
// あわせてサイト側の粗悪コンテンツ除外ルールと管理者NGリストを適用する。
import { NextRequest, NextResponse } from 'next/server'
import {
  buildSnapshotSearchUrl,
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
  isRealtimeMergeable,
  planMergedPage,
  type RealtimeSegment,
} from '@/lib/search/realtime-search'
import { applyExclusionRules } from '@/lib/search/exclusion-rules'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'
import type { RankingItem } from '@/types/ranking'

export const revalidate = 0

const FETCH_TIMEOUT_MS = 10000
// 環境変数で即時ロールバック可能（'false' で Snapshot 単独に戻る）
const REALTIME_ENABLED = process.env.SEARCH_REALTIME_ENABLED !== 'false'

type SnapshotPage = { items: RankingItem[]; totalCount: number }
type SnapshotFailure = { error: string; status: number; detail?: string }

async function fetchSnapshotPage(
  conditions: SearchConditions,
  offset: number,
  limit: number
): Promise<SnapshotPage | SnapshotFailure> {
  let response: Response
  try {
    response = await fetch(buildSnapshotSearchUrl(conditions, { offset, limit }), {
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
  const boundary = getRealtimeBoundary()
  const mergeable = REALTIME_ENABLED && isRealtimeMergeable(conditions, boundary)

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
      cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
    })
  }

  // ---- マージ: リアルタイム区間 + Snapshot ----
  // Snapshot の offset はリアルタイム件数 R に依存する。2ページ目以降はクライアントが
  // 前回応答の realtimeCount を rtCount として送るので、それを仮の R として並列取得し、
  // 実際の R とずれて窓が足りない場合だけ取り直す（新着が増えた直後のみ発生）。
  const rtCountHint = Math.max(0, parseInt(request.nextUrl.searchParams.get('rtCount') ?? '0', 10) || 0)
  const provisional = planMergedPage(conditions.page, SEARCH_PAGE_SIZE, rtCountHint)

  const [realtimeResult, snapshotResult] = await Promise.all([
    fetchRealtimeSegment(conditions, boundary).then(
      (segment): { segment: RealtimeSegment; error?: undefined } => ({ segment }),
      (error: unknown): { segment?: undefined; error: string } => ({
        error: error instanceof Error ? error.message : 'realtime_error',
      })
    ),
    fetchSnapshotPage(conditions, provisional.snapshotOffset, SEARCH_PAGE_SIZE),
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
  const plan = planMergedPage(conditions.page, SEARCH_PAGE_SIZE, segment.items.length)
  let snapshotItems = snapshotResult.items
  // 仮の窓 [provisional.offset, +PAGE) が実際に必要な窓を覆っていなければ取り直す
  const covers =
    plan.snapshotLimit === 0 ||
    (plan.snapshotOffset >= provisional.snapshotOffset &&
      plan.snapshotOffset + plan.snapshotLimit <= provisional.snapshotOffset + SEARCH_PAGE_SIZE)
  if (!covers) {
    const refetched = await fetchSnapshotPage(conditions, plan.snapshotOffset, SEARCH_PAGE_SIZE)
    if (isFailure(refetched)) {
      return NextResponse.json({ error: refetched.error, detail: refetched.detail }, { status: refetched.status })
    }
    snapshotItems = refetched.items
  } else if (plan.snapshotOffset > provisional.snapshotOffset) {
    snapshotItems = snapshotItems.slice(plan.snapshotOffset - provisional.snapshotOffset)
  }

  const merged = assembleMergedPage(segment.items, snapshotItems, plan)
  return await respond(merged, segment.items.length + snapshotResult.totalCount, conditions, {
    source: 'merged',
    boundary,
    realtimeCount: segment.items.length,
    realtimeTruncated: segment.truncated,
    cacheControl: 'public, s-maxage=30, stale-while-revalidate=60',
  })
}

interface RespondMeta {
  source: 'merged' | 'snapshot'
  boundary: string
  realtimeCount: number
  realtimeTruncated?: boolean
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
    },
    { headers: { 'Cache-Control': meta.cacheControl } }
  )
}
