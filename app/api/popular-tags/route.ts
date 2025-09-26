import { NextRequest, NextResponse } from 'next/server'
import { getPopularTags } from '@/lib/popular-tags'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { getCacheHeaders } from '@/lib/cache-durations'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const genre = searchParams.get('genre') as RankingGenre || 'all'
  const period = searchParams.get('period') as RankingPeriod || '24h'
  
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