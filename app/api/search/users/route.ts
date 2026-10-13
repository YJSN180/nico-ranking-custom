import { withTimeout } from '@/lib/abort-signal'
import { searchAccessDenied } from '@/lib/search/access'
// ユーザー検索 API。検索欄の候補「〜でユーザーを探す」から画面が呼ぶ。
//   q = 検索語 / sort = followers（既定・省略）| videos | relevance / page = 2 以上のとき
// 管理者 NG（投稿者 ID・投稿者名）に当たるユーザーは返さない。
import { NextRequest, NextResponse } from 'next/server'
import {
  USER_SEARCH_PAGE_SIZE,
  buildUserSearchQuery,
  fetchUserSearch,
  parseUserSearchConditions,
} from '@/lib/search/user-search'
import { getServerNGList } from '@/lib/ng-list-server'
import { matchesAuthorNameNG } from '@/lib/ng-filter-core'
import { searchRateLimit, tooManyRequests } from '@/lib/search/rate-limit'

export const preferredRegion = 'hnd1'
export const revalidate = 0

const USERS_DEADLINE_MS = 8000
const KV_READ_TIMEOUT_MS = 3000
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await searchAccessDenied(request)
  if (denied) return denied
  const conditions = parseUserSearchConditions(request.nextUrl.searchParams)
  if (!conditions.q)
    return NextResponse.json(
      { error: 'no_query' },
      { status: 400, headers: NO_STORE },
    )
  if (
    buildUserSearchQuery(conditions) !==
    request.nextUrl.search.replace(/^\?/, '')
  ) {
    return NextResponse.json(
      { error: 'invalid_params' },
      { status: 400, headers: NO_STORE },
    )
  }
  const retryAfter = searchRateLimit.take()
  if (retryAfter > 0) return tooManyRequests(retryAfter)
  const deadline = withTimeout(USERS_DEADLINE_MS, request.signal)
  const ngListPromise = getServerNGList({
    signal: deadline,
    timeoutMs: KV_READ_TIMEOUT_MS,
  })
  let result
  try {
    result = await fetchUserSearch(conditions, { signal: deadline })
  } catch {
    return NextResponse.json(
      { error: 'user_search_unavailable' },
      { status: 502, headers: NO_STORE },
    )
  }
  const ngList = await ngListPromise
  const hiddenIds = new Set([
    ...ngList.authorIds,
    ...(ngList.autoAuthorIds ?? []),
  ])
  const items = result.items.filter(
    (user) =>
      !hiddenIds.has(user.id) &&
      !matchesAuthorNameNG(user.name, ngList.authorNames),
  )
  return NextResponse.json(
    {
      items,
      totalCount: result.totalCount,
      page: conditions.page,
      pageSize: USER_SEARCH_PAGE_SIZE,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  )
}
