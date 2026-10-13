import { withTimeout } from '@/lib/abort-signal'
import { searchAccessDenied } from '@/lib/search/access'
// 動画IDで開く API。検索欄に動画ID・視聴ページの URL だけを入れたときに、画面が呼ぶ。
//   ids = 動画ID のカンマ区切り（入力順・重複なし・最大 20 件）
// 管理者 NG に当たる動画は中身を返さず hiddenIds で知らせる（画面は「表示できません」とだけ出す）。
import { NextRequest, NextResponse } from 'next/server'
import {
  buildVideoLookupQuery,
  fetchVideosByIds,
  sanitizeLookupIds,
} from '@/lib/search/video-lookup'
import { getServerNGList } from '@/lib/ng-list-server'
import { filterWithNGListCore } from '@/lib/ng-filter-core'
import { enrichmentRateLimit, tooManyRequests } from '@/lib/search/rate-limit'

export const preferredRegion = 'hnd1'
export const revalidate = 0

/** 全体の期限。関数の上限（vercel.json の maxDuration 15 秒）より前に、取れた分だけで応答する */
const LOOKUP_DEADLINE_MS = 8000
const KV_READ_TIMEOUT_MS = 3000

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await searchAccessDenied(request)
  if (denied) return denied
  const ids = sanitizeLookupIds(request.nextUrl.searchParams.get('ids'))
  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'no_ids' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  // 受け付けるのは画面が組み立てる正規形だけ（知らないキー・形式不正の ID・上限超えで CDN のキャッシュを外させない）
  if (
    buildVideoLookupQuery(ids) !== request.nextUrl.search.replace(/^\?/, '')
  ) {
    return NextResponse.json(
      { error: 'invalid_params' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const retryAfter = enrichmentRateLimit.take()
  if (retryAfter > 0) return tooManyRequests(retryAfter)
  const deadline = withTimeout(LOOKUP_DEADLINE_MS, request.signal)
  const ngListPromise = getServerNGList({
    signal: deadline,
    timeoutMs: KV_READ_TIMEOUT_MS,
  })
  const result = await fetchVideosByIds(ids, { signal: deadline })
  const visible = new Set(
    filterWithNGListCore(result.items, await ngListPromise).filteredItems.map(
      (item) => item.id,
    ),
  )
  return NextResponse.json(
    {
      items: result.items.filter((item) => visible.has(item.id)),
      hiddenIds: result.items
        .filter((item) => !visible.has(item.id))
        .map((item) => item.id),
      missing: result.missing,
      unavailable: result.unavailable,
      failed: result.failed,
    },
    {
      headers: {
        // 再生数などは変わるので短め。取れなかった分がある応答は、同じ URL で取り直せるようにさらに短くする
        'Cache-Control':
          result.failed.length > 0
            ? 'public, s-maxage=30, stale-while-revalidate=30'
            : 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  )
}
