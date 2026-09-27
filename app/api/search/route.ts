// 詳細検索API（検索リアルタイム統合計画 S3）
// Snapshot 検索API v2（毎朝5時時点のインデックス・強力なフィルタ）を基本とし、
// 条件がマージ可能なときは索引の最新より後の区間だけを新着の取得元（nvapi v2・本家の検索ページ）から
// 取得して先頭に連結する。どれも CORS 非対応のためサーバー側で呼び出し、
// あわせてサイト側の粗悪コンテンツ除外ルールと管理者NGリストを適用する。
import { NextRequest, NextResponse } from 'next/server'
import {
  buildSnapshotSearchUrl,
  fetchSnapshotNewestStartTime,
  mapSnapshotVideoToRankingItem,
  parseSearchApiQuery,
  SEARCH_PAGE_SIZE,
  type SearchConditions,
  type SnapshotSearchResponse,
} from '@/lib/search/snapshot-search'
import {
  assembleMergedPage,
  isRealtimeCandidate,
  isRealtimeEnabled,
  isRealtimeMergeable,
  parseRequestedBoundary,
  planMergedPage,
  resolveRealtimeBoundary,
} from '@/lib/search/realtime-search'
import { applyExclusionRules } from '@/lib/search/exclusion-rules'
import { fetchFreshSegment } from '@/lib/search/fresh-segment'
import { fetchRealtimeWindow, type FreshOutcome, type RealtimeWindow } from '@/lib/search/realtime-window'
import { applyServerNgContext, loadServerNgContext, type ServerNgContext } from '@/lib/ng-filter-server'
import { anySignal, withTimeout } from '@/lib/abort-signal'
import { searchRateLimit, tooManyRequests } from '@/lib/search/rate-limit'
import type { RankingItem } from '@/types/ranking'

export const revalidate = 0

/**
 * リクエスト全体の期限。上流と KV のすべての呼び出しに配り、関数の上限（vercel.json の maxDuration 15 秒）より前に
 * 設計した応答で終える（個々のタイムアウトの合計は上限を超えうる）
 */
const SEARCH_DEADLINE_MS = 12000
const FETCH_TIMEOUT_MS = 10000
const BOUNDARY_TIMEOUT_MS = 3000
/** リアルタイム区間取得の全体予算。超過時は Snapshot 単独に縮退する（プラットフォーム504より先に必ず効かせる） */
const REALTIME_BUDGET_MS = 4000
const NVAPI_TIMEOUT_MS = 4000
/** 管理者 NG・自動 NG の KV 読み取り 1 回のタイムアウト（再試行を含めて全体の期限で打ち切る） */
const KV_READ_TIMEOUT_MS = 3000

type SnapshotPage = { items: RankingItem[]; totalCount: number }
type SnapshotFailure = { error: string; status: number; detail?: string }

async function fetchSnapshotPage(
  conditions: SearchConditions,
  offset: number,
  limit: number,
  deadline: AbortSignal,
  startTimeBefore?: string
): Promise<SnapshotPage | SnapshotFailure> {
  let response: Response
  try {
    response = await fetch(buildSnapshotSearchUrl(conditions, { offset, limit, startTimeBefore }), {
      headers: { 'User-Agent': 'nico-rank.com (Re:turn) search' },
      cache: 'no-store',
      signal: withTimeout(FETCH_TIMEOUT_MS, deadline),
    })
  } catch (error) {
    const isTimeout = deadline.aborted || (error instanceof Error && error.name === 'TimeoutError')
    return { error: isTimeout ? 'search_timeout' : 'search_unreachable', status: 504 }
  }
  if (!response.ok) {
    // 400 は条件の不正（QUERY_PARSE_ERROR など。範囲外の数値や解釈できない語）。上流の障害（502）と分けて、画面で条件を見直す案内を出す
    if (response.status === 400) {
      const body = (await response.json().catch(() => null)) as SnapshotSearchResponse | null
      return { error: 'search_query_error', status: 400, detail: body?.meta?.errorMessage }
    }
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
  // 受け付けるのは正規形の問い合わせだけ（知らないキーや書き換えで CDN のキャッシュを外し、上流への問い合わせを増やせないようにする）
  const parsed = parseSearchApiQuery(request.nextUrl.searchParams, request.nextUrl.search.replace(/^\?/, ''))
  if (!parsed) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const { conditions, extras } = parsed
  // インスタンスごとの軽い流量制限（上流への問い合わせの急増を抑える。形の不正な問い合わせは数えない）
  const retryAfter = searchRateLimit.take()
  if (retryAfter > 0) return tooManyRequests(retryAfter)
  const deadline = AbortSignal.timeout(SEARCH_DEADLINE_MS)
  // NG の読み取りは上流の問い合わせと並列に始める（後から始めると、残りの予算が少ないときに KV 待ちで期限を越える）。
  // 失敗や期限切れでも投げず、直前の成功値（無ければ空）で続く
  const ngContext = loadServerNgContext({ signal: deadline, timeoutMs: KV_READ_TIMEOUT_MS })
  const now = new Date()
  // 境界 T: 同じ条件で Snapshot の索引が実際に持つ最新の投稿時刻の 1 秒後。2 ページ目以降はクライアントが
  // 前回応答の boundary を返すので、それを使ってページ間で一貫させる。
  // 問い合わせに失敗したら合成しない（固定の 05:00 を境界にすると、索引の更新が遅れた日は 1 日分が欠ける）
  let boundary: string | undefined
  let boundaryError: string | undefined
  let mergeable = false
  if (isRealtimeEnabled() && isRealtimeCandidate(conditions)) {
    const requested = parseRequestedBoundary(extras.boundary, now)
    if (requested) {
      boundary = requested
    } else {
      try {
        boundary = resolveRealtimeBoundary({
          newestSnapshotStartTime: await fetchSnapshotNewestStartTime(conditions, fetch, BOUNDARY_TIMEOUT_MS, deadline),
          now,
        })
      } catch {
        boundaryError = 'boundary_unavailable'
      }
    }
    mergeable = boundary !== undefined && isRealtimeMergeable(conditions, boundary)
  }

  // ---- Snapshot 単独（従来どおり） ----
  if (!mergeable || boundary === undefined) {
    const snapshot = await fetchSnapshotPage(conditions, (conditions.page - 1) * SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE, deadline)
    if (isFailure(snapshot)) {
      return NextResponse.json({ error: snapshot.error, detail: snapshot.detail }, { status: snapshot.status })
    }
    return await respond(snapshot.items, snapshot.totalCount, conditions, ngContext, {
      source: 'snapshot',
      boundary,
      realtimeCount: 0,
      ...(boundaryError
        ? // 新着を取れなかった応答は、取り直せるように短く置く
          { realtimeError: boundaryError, cacheControl: 'public, s-maxage=30, stale-while-revalidate=60' }
        : // SWR を短めにして、自動NG・許可リストの反映遅れを 3 分以内に抑える
          { cacheControl: 'public, s-maxage=60, stale-while-revalidate=120' }),
    })
  }

  // ---- マージ: リアルタイム区間 + Snapshot ----
  // Snapshot の offset はリアルタイム件数 R に依存する。2ページ目以降はクライアントが
  // 前回応答の realtimeCount を rtCount として送るので、それを仮の R として並列取得し、
  // 実際の R とずれて窓が足りない場合だけ取り直す（新着が増えた直後のみ発生）。
  const rtCountHint = extras.rtCount ?? 0
  const provisional = planMergedPage(conditions.page, SEARCH_PAGE_SIZE, rtCountHint)
  const pageFrom = (conditions.page - 1) * SEARCH_PAGE_SIZE

  // Snapshot 側は境界より前だけ（filters[startTime][lt]=T）を取り、新着側（nvapi の minRegisteredAt=T と
  // 本家ページの T 以降）と構成的に排他にする。これで dedup に頼らず offset 計算が厳密になり、ページ間の重複が起きない
  // 最新区間（本家ページ）は nvapi と並列に取り、失敗しても nvapi だけで続ける（隠れ依存にしない）。
  // ただしショートだけの検索では本家ページが唯一の新着の取得元なので、その失敗は新着の失敗として扱う
  const freshPromise = fetchFreshSegment(conditions, boundary, { signal: deadline }).then(
    (segment): FreshOutcome => ({ segment }),
    (error: unknown): FreshOutcome => ({ error: error instanceof Error ? error.message : 'fresh_error' })
  )
  const [realtimeResult, snapshotResult] = await Promise.all([
    // 新着区間のうちこのページが占める部分だけを取る（新着が多い語でも、ページ送りに合わせて nvapi の続きを取る）
    fetchRealtimeWindow({
      conditions,
      boundary,
      from: pageFrom,
      to: pageFrom + SEARCH_PAGE_SIZE,
      fresh: freshPromise,
      timeoutMs: NVAPI_TIMEOUT_MS,
      signal: anySignal([deadline, AbortSignal.timeout(REALTIME_BUDGET_MS)]),
    }).then(
      (realtimeWindow): { realtimeWindow: RealtimeWindow; error?: undefined } => ({ realtimeWindow }),
      (error: unknown): { realtimeWindow?: undefined; error: string } => ({
        error: error instanceof Error ? error.message : 'realtime_error',
      })
    ),
    fetchSnapshotPage(conditions, provisional.snapshotOffset, SEARCH_PAGE_SIZE, deadline, boundary),
  ])
  const freshResult = await freshPromise

  if (isFailure(snapshotResult)) {
    return NextResponse.json({ error: snapshotResult.error, detail: snapshotResult.detail }, { status: snapshotResult.status })
  }

  // 新着側が落ちたら Snapshot 単独に縮退（source ラベルで可視化＝隠れフォールバックにしない）。
  // 並列に取った Snapshot は境界より前だけなので使わず、境界なしで取り直す（境界以降の索引の動画を落とさない）
  if (!realtimeResult.realtimeWindow) {
    const snapshot = await fetchSnapshotPage(conditions, (conditions.page - 1) * SEARCH_PAGE_SIZE, SEARCH_PAGE_SIZE, deadline)
    if (isFailure(snapshot)) {
      return NextResponse.json({ error: snapshot.error, detail: snapshot.detail }, { status: snapshot.status })
    }
    return await respond(snapshot.items, snapshot.totalCount, conditions, ngContext, {
      source: 'snapshot',
      boundary,
      realtimeCount: 0,
      realtimeError: realtimeResult.error,
      cacheControl: 'public, s-maxage=30, stale-while-revalidate=60',
    })
  }

  const realtimeWindow = realtimeResult.realtimeWindow
  const plan = planMergedPage(conditions.page, SEARCH_PAGE_SIZE, realtimeWindow.total)
  let snapshotItems = snapshotResult.items
  // 仮の窓 [provisional.offset, +PAGE) が実際に必要な窓を覆っていなければ取り直す
  const covers =
    plan.snapshotLimit === 0 ||
    (plan.snapshotOffset >= provisional.snapshotOffset &&
      plan.snapshotOffset + plan.snapshotLimit <= provisional.snapshotOffset + SEARCH_PAGE_SIZE)
  if (!covers) {
    const refetched = await fetchSnapshotPage(conditions, plan.snapshotOffset, SEARCH_PAGE_SIZE, deadline, boundary)
    if (isFailure(refetched)) {
      return NextResponse.json({ error: refetched.error, detail: refetched.detail }, { status: refetched.status })
    }
    snapshotItems = refetched.items
  } else if (plan.snapshotOffset > provisional.snapshotOffset) {
    snapshotItems = snapshotItems.slice(plan.snapshotOffset - provisional.snapshotOffset)
  }

  // 本家ページが落ちた（全体）か、動画とショートの片方だけ落ちた（一部）ときは、最新の投稿が欠けうることを知らせる
  const freshError = freshResult.error ?? freshResult.segment?.error
  const merged = assembleMergedPage(realtimeWindow.items, snapshotItems, plan)
  return await respond(merged, realtimeWindow.total + snapshotResult.totalCount, conditions, ngContext, {
    source: 'merged',
    boundary,
    realtimeCount: realtimeWindow.total,
    ...(realtimeWindow.gap ? { realtimeGap: realtimeWindow.gap } : {}),
    freshCount: realtimeWindow.freshAdded,
    ...(freshError ? { freshError } : {}),
    cacheControl: 'public, s-maxage=30, stale-while-revalidate=60',
  })
}

interface RespondMeta {
  source: 'merged' | 'snapshot'
  /** 索引と新着の境界。決められなかった（問い合わせに失敗した・対象外の条件）ときは無し */
  boundary?: string
  realtimeCount: number
  /**
   * 新着区間のうち投稿が欠けうる範囲（nvapi の返せる深さや本家ページの読み足しの上限、nvapi の索引の遅れで
   * 取れなかった範囲をまとめたもの）
   */
  realtimeGap?: { from: string; to: string }
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
  ngContext: Promise<ServerNgContext>,
  meta: RespondMeta
): Promise<NextResponse> {
  // サイト側の粗悪コンテンツ除外ルール → 管理者NGリスト（ランキングと同じKV上のリスト）
  // どちらもリアルタイム区間・Snapshot 区間の両方に同一適用される
  const { items: exclusionFiltered, excludedCount } = applyExclusionRules(items)
  const { filteredItems, filteredCount = 0 } = applyServerNgContext(exclusionFiltered, await ngContext)
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
      ...(meta.boundary ? { boundary: meta.boundary } : {}),
      realtimeCount: meta.realtimeCount,
      ...(meta.realtimeGap ? { realtimeTruncated: true, realtimeGap: meta.realtimeGap } : {}),
      ...(meta.realtimeError ? { realtimeError: meta.realtimeError } : {}),
      ...(meta.freshCount !== undefined ? { freshCount: meta.freshCount } : {}),
      ...(meta.freshError ? { freshError: meta.freshError } : {}),
    },
    { headers: { 'Cache-Control': meta.cacheControl } }
  )
}
