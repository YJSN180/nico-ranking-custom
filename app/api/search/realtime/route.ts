// リアルタイム区間の単独取得（検索リアルタイム統合計画 S2）
// /api/search のマージ実装(S3)前に、Vercel からの nvapi 到達性と区間取得を
// プレビューで実測するための内部ルート。S3 以降もデバッグ用に残す。
import { NextRequest, NextResponse } from 'next/server'
import { parseSearchConditions } from '@/lib/search/snapshot-search'
import { fetchRealtimeSegment, getRealtimeBoundary, isRealtimeMergeable } from '@/lib/search/realtime-search'
import { applyExclusionRules } from '@/lib/search/exclusion-rules'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'

export const revalidate = 0

export async function GET(request: NextRequest): Promise<NextResponse> {
  const conditions = parseSearchConditions(request.nextUrl.searchParams)
  const boundary = getRealtimeBoundary()
  const mergeable = isRealtimeMergeable(conditions, boundary)
  if (!mergeable) {
    return NextResponse.json({ boundary, mergeable, items: [], reason: 'not_mergeable' })
  }
  const started = Date.now()
  try {
    const segment = await fetchRealtimeSegment(conditions, boundary)
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
      { boundary, mergeable, error: error instanceof Error ? error.message : 'realtime_error', elapsedMs: Date.now() - started },
      { status: 502 }
    )
  }
}
