import { NextRequest, NextResponse } from 'next/server'
import { filterRankingDataServer } from '@/lib/ng-filter-server'
import { captureWebException } from '@/lib/sentry/capture'

// フェーズ2.5-1: SSRはランキングの1ページ目のみをHTMLに埋め込むため、
// クライアントはマウント後にこのルートで残り全件を補完する。
// ゲートウェイ直フェッチ（/api/ranking の本番301先）と異なり、
// SSRと同じ管理者NGフィルタ（filterRankingDataServer）を適用して返す。
export const revalidate = 0
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const tag = searchParams.get('tag')

  const params = new URLSearchParams({ genre, period })
  if (tag) params.set('tag', tag)

  const gatewayBase = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'
  const upstreamUrl = new URL('/api/ranking', gatewayBase)
  params.forEach((value, key) => upstreamUrl.searchParams.set(key, value))

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'nico-ranking-hydrate/1.0'
      },
      cache: 'no-store',
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId))

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch ranking data', status: response.status },
        { status: 502 }
      )
    }

    const data = (await response.json()) as { items?: unknown; popularTags?: string[] }
    if (!data || !Array.isArray(data.items)) {
      return NextResponse.json({ error: 'Invalid upstream data' }, { status: 502 })
    }

    const { filteredData } = await filterRankingDataServer({
      items: data.items,
      popularTags: data.popularTags
    })

    return NextResponse.json(filteredData, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    captureWebException(error, {
      tags: {
        surface: 'ranking-full-hydrate',
        genre,
        period
      }
    })
    return NextResponse.json(
      { error: 'Failed to fetch ranking data', type: 'hydrate_error' },
      { status: 500 }
    )
  }
}
