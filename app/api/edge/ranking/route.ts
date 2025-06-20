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
      
      const isCacheHit = items && items.length > 0
      
      const response = NextResponse.json({
        items: items || [],
        hasMore: false,
        totalCached: items?.length || 0
      })
      
      if (isCacheHit) {
        response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
        response.headers.set('X-Cache-Status', 'HIT')
        response.headers.set('X-Total-Cached', items.length.toString())
      } else {
        response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
        response.headers.set('X-Cache-Status', 'MISS')
      }
      
      response.headers.set('X-API-Version', '2')
      return response
    }

    // Genre ranking
    const data = await getGenreRanking(genre, period as RankingPeriod)
    
    const isCacheHit = data && data.items && data.items.length > 0
    const maxItems = 500
    
    const response = NextResponse.json({
      items: isCacheHit ? data.items.slice(0, maxItems) : [],
      popularTags: data?.popularTags || [],
      hasMore: false,
      totalCached: data?.items?.length || 0
    })
    
    if (isCacheHit) {
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
      response.headers.set('X-Cache-Status', 'HIT')
      response.headers.set('X-Max-Items', String(maxItems))
    } else {
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
      response.headers.set('X-Cache-Status', 'MISS')
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
    return NextResponse.json(
      { error: 'Failed to fetch ranking data', details: error?.message },
      { status: 500 }
    )
  }
}