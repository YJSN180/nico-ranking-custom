import { NextRequest, NextResponse } from 'next/server'
import { filterRankingDataServer } from '@/lib/ng-filter-server'
import { captureWebException } from '@/lib/sentry/capture'
import { fetchWithTransientRetry } from '@/lib/fetch-with-transient-retry'

// 上流の取得の期限（一時障害の再試行と本文の読み取りを含む）
const UPSTREAM_TIMEOUT_MS = 30_000

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

  // 本番は SSR と同じ設定済みゲートウェイを使う。保護されたデプロイ URL に戻らない。
  // プレビューは既存の同一オリジンプロキシを使う。
  const upstreamBase = process.env.VERCEL_ENV === 'production'
    ? process.env.RANKING_SSR_GATEWAY_URL || 'https://nico-rank.com'
    : request.nextUrl.origin
  const upstreamUrl = new URL('/api/ranking', upstreamBase)
  params.forEach((value, key) => upstreamUrl.searchParams.set(key, value))

  try {
    // 期限は本文の読み取りまで掛ける（ヘッダー受信で外すと、本文が止まったときに無期限に待つ）。
    // R2 の一時障害などの 5xx・通信エラーは 1 回だけ再試行する
    const response = await fetchWithTransientRetry(upstreamUrl.toString(), {
      // ヘッダーはSSR(page.tsx)のフェッチと同一にする（実績のある組み合わせ）
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'nico-ranking-web/1.0'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })

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
