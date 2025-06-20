import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
import type { RankingPeriod } from '@/types/ranking-config'

export const runtime = 'nodejs'

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
      // eslint-disable-next-line no-console
      console.log(`[Edge API] Fetching tag ranking: genre=${genre}, period=${period}, tag=${tag}`)
      const items = await getTagRanking(genre, period as RankingPeriod, tag)
      // eslint-disable-next-line no-console
      console.log(`[Edge API] Tag ranking result: ${items?.length || 0} items`)
      
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
    
    // Log metadata for debugging
    if (data?.metadata) {
      // eslint-disable-next-line no-console
      console.log(`[Edge API] Metadata: updatedAt=${data.metadata.updatedAt}, groupId=${data.metadata.groupId}, genres=${data.metadata.genresInGroup?.join(',')}`)
    }
    
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
      // eslint-disable-next-line no-console
      console.warn(`[Edge API] No data found for genre=${genre}, period=${period}`)
    }
    
    response.headers.set('X-API-Version', '2')
    return response
    
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Edge ranking API error:', error)
    // eslint-disable-next-line no-console
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    
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