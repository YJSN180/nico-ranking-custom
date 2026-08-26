// 詳細検索API: スナップショット検索API v2 のプロキシ
// スナップショットAPIはCORS非対応のためサーバー側で呼び出し、
// あわせてサイト側の粗悪コンテンツ除外ルールを適用する
import { NextRequest, NextResponse } from 'next/server'
import {
  buildSnapshotSearchUrl,
  mapSnapshotVideoToRankingItem,
  parseSearchConditions,
  SEARCH_PAGE_SIZE,
  type SnapshotSearchResponse,
} from '@/lib/search/snapshot-search'
import { applyExclusionRules } from '@/lib/search/exclusion-rules'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'

export const revalidate = 0

const FETCH_TIMEOUT_MS = 10000

export async function GET(request: NextRequest): Promise<NextResponse> {
  const conditions = parseSearchConditions(request.nextUrl.searchParams)

  const url = buildSnapshotSearchUrl(conditions)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'nico-rank.com (Re:turn) search',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json(
      { error: isTimeout ? 'search_timeout' : 'search_unreachable' },
      { status: 504 }
    )
  }

  if (!response.ok) {
    // 503 はスナップショットAPIのメンテナンス中
    const status = response.status === 503 ? 503 : 502
    return NextResponse.json(
      { error: response.status === 503 ? 'search_maintenance' : 'search_upstream_error' },
      { status }
    )
  }

  let payload: SnapshotSearchResponse
  try {
    payload = (await response.json()) as SnapshotSearchResponse
  } catch {
    return NextResponse.json({ error: 'search_invalid_response' }, { status: 502 })
  }

  if (payload.meta.status !== 200 || !payload.data) {
    return NextResponse.json(
      { error: 'search_query_error', detail: payload.meta.errorMessage },
      { status: 400 }
    )
  }

  const offset = (conditions.page - 1) * SEARCH_PAGE_SIZE
  const mapped = payload.data.map((video, index) =>
    mapSnapshotVideoToRankingItem(video, index, offset)
  )
  // サイト側の粗悪コンテンツ除外ルール
  const { items: exclusionFiltered, excludedCount } = applyExclusionRules(mapped)
  // 管理者NGリスト（ランキングと同じKV上のリスト）を適用
  const { filteredItems, filteredCount } = await filterRankingItemsServer(exclusionFiltered)

  return NextResponse.json(
    {
      items: filteredItems,
      totalCount: payload.meta.totalCount ?? 0,
      page: conditions.page,
      pageSize: SEARCH_PAGE_SIZE,
      excludedCount: excludedCount + filteredCount,
    },
    {
      headers: {
        // エッジ/CDNで1分キャッシュ（スナップショットAPIのインデックスは1日1回更新）
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    }
  )
}
