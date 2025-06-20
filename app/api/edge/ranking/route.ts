import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
import type { RankingPeriod } from '@/types/ranking-config'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const tag = searchParams.get('tag') || undefined

  // Validate period only (accept all genres)
  const validPeriods = ['24h', 'hour']
  
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  try {
    // Tag-specific ranking
    if (tag) {
      const items = await getTagRanking(genre, period as RankingPeriod, tag)
      
      // タグランキングが見つからない場合でも空の配列を返す（エラーにしない）
      const response = NextResponse.json({
        items: items || [],
        hasMore: false,
        totalCached: items?.length || 0
      })
      
      if (items && items.length > 0) {
        response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
        response.headers.set('X-Cache-Status', 'HIT')
        response.headers.set('X-Total-Cached', items.length.toString())
      } else {
        response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
        response.headers.set('X-Cache-Status', 'MISS')
      }
      
      response.headers.set('X-API-Version', '2')
      return response
    }

    // Genre ranking
    const data = await getGenreRanking(genre, period as RankingPeriod)
    
    // Metadata available in response
    
    // データが見つからない場合でも空のレスポンスを返す（エラーにしない）
    const maxItems = 500
    
    const response = NextResponse.json({
      items: data?.items?.slice(0, maxItems) || [],
      popularTags: data?.popularTags || [],
      hasMore: false,
      totalCached: data?.items?.length || 0,
      metadata: data?.metadata || null
    })
    
    if (data && data.items && data.items.length > 0) {
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
      response.headers.set('X-Cache-Status', 'HIT')
      response.headers.set('X-Max-Items', String(maxItems))
    } else {
      // データがない場合は短いキャッシュ時間
      response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      response.headers.set('X-Cache-Status', 'MISS')
      // No data found - return empty response
    }
    
    response.headers.set('X-API-Version', '2')
    return response
    
  } catch (error: any) {
    // Error occurred - return safe empty response
    
    // エラーが発生しても空のデータを返す（サーバーエラーを避ける）
    const response = NextResponse.json({
      items: [],
      popularTags: [],
      hasMore: false,
      totalCached: 0,
      error: 'データの取得に一時的な問題が発生しています'
    })
    
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    response.headers.set('X-Cache-Status', 'ERROR')
    response.headers.set('X-API-Version', '2')
    
    return response
  }
}