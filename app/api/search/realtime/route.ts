// リアルタイム区間の単独取得（検索リアルタイム統合計画 S2）
// /api/search のマージ実装(S3)前に、Vercel からの nvapi 到達性と区間取得を
// プレビューで実測するための内部ルート。S3 以降もデバッグ用に残す。
import { NextRequest, NextResponse } from 'next/server'
import { parseSearchApiQuery } from '@/lib/search/snapshot-search'
import { fetchRealtimeSegment, getRealtimeBoundary, isRealtimeEnabled, isRealtimeMergeable } from '@/lib/search/realtime-search'
import { applyExclusionRules } from '@/lib/search/exclusion-rules'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'
import { searchRateLimit, tooManyRequests } from '@/lib/search/rate-limit'

export const revalidate = 0

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 本番では公開しない（プレビュー/ローカル専用のデバッグルート）。kill switch も /api/search と共有
  if (process.env.VERCEL_ENV === 'production' || !isRealtimeEnabled()) {
    return new NextResponse(null, { status: 404 })
  }
  // /api/search と同じく、正規形の問い合わせだけを受け付ける
  const parsed = parseSearchApiQuery(request.nextUrl.searchParams, request.nextUrl.search.replace(/^\?/, ''))
  if (!parsed) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const conditions = parsed.conditions
  const retryAfter = searchRateLimit.take()
  if (retryAfter > 0) return tooManyRequests(retryAfter)
  const boundary = getRealtimeBoundary()
  const mergeable = isRealtimeMergeable(conditions, boundary)
  if (!mergeable) {
    return NextResponse.json({ boundary, mergeable, items: [], reason: 'not_mergeable' })
  }
  const started = Date.now()
  try {
    const segment = await fetchRealtimeSegment(conditions, boundary, fetch, 4000, AbortSignal.timeout(4000))
    const { items: exclusionFiltered, excludedCount } = applyExclusionRules(segment.items)
    const { filteredItems, filteredCount } = await filterRankingItemsServer(exclusionFiltered)
    return NextResponse.json(
      {
        boundary,
        mergeable,
        items: filteredItems,
        upstreamTotal: segment.upstreamTotal,
        truncated: segment.truncated,
        excludedCount: excludedCount + filteredCount,
        elapsedMs: Date.now() - started,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    )
  } catch (error) {
    return NextResponse.json(
      { boundary, mergeable, error: 'realtime_error', elapsedMs: Date.now() - started },
      { status: 502 }
    )
  }
}
