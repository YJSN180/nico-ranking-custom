import { NextRequest, NextResponse } from 'next/server'
import { getPopularTags } from '@/lib/popular-tags'
import { RANKING_GENRES, type RankingGenre, type RankingPeriod } from '@/types/ranking-config'
import { getCacheHeaders } from '@/lib/cache-durations'

// 人気タグがあるのはパイプラインが集めるジャンル（カスタムランキングは対象外）と 2 つの期間だけ
const POPULAR_TAG_GENRES = new Set<string>(
  RANKING_GENRES.map(({ value }) => value).filter((value) => value !== 'custom')
)

function isPopularTagGenre(value: string): value is RankingGenre {
  return POPULAR_TAG_GENRES.has(value)
}

function isRankingPeriod(value: string): value is RankingPeriod {
  return value === '24h' || value === 'hour'
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'

  if (!isPopularTagGenre(genre) || !isRankingPeriod(period)) {
    // 不正な値では上流（KV・ゲートウェイ）に問い合わせない。形は失敗時と同じ 200 の空配列
    return NextResponse.json({ tags: [] }, {
      headers: {
        'Cache-Control': getCacheHeaders('popular-tags')
      }
    })
  }
  
  try {
    // 環境変数の確認（デバッグ用）
    const host = request.headers.get('host') || ''
    const isPreview = host.includes('.vercel.app')
    
    if (isPreview) {
      const hasKVCredentials = Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID &&
        process.env.KV_RANKING_ID &&
        process.env.CLOUDFLARE_API_TOKEN
      )
      
      if (!hasKVCredentials) {
        console.warn('[API/popular-tags] Missing Cloudflare KV credentials in preview environment')
        console.warn('[API/popular-tags] Required: CLOUDFLARE_ACCOUNT_ID, KV_RANKING_ID, CLOUDFLARE_API_TOKEN')
      }
    }
    
    const tags = await getPopularTags(genre, period)
    
    return NextResponse.json({ tags }, {
      headers: {
        'Cache-Control': getCacheHeaders('popular-tags')
      }
    })
  } catch (error) {
    console.error('[API/popular-tags] Error:', error)
    console.error('[API/popular-tags] Genre:', genre, 'Period:', period)
    
    return NextResponse.json({ tags: [] }, {
      status: 200, // エラーでも200を返して空配列を返す
      headers: {
        'Cache-Control': getCacheHeaders('popular-tags')
      }
    })
  }
}