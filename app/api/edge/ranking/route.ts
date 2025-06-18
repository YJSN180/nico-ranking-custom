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
      
      if (items && items.length > 0) {
        const response = NextResponse.json({
          items: items,
          hasMore: false,
          totalCached: items.length
        })
        response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
        response.headers.set('X-Cache-Status', 'CF-HIT')
        response.headers.set('X-Total-Cached', items.length.toString())
        response.headers.set('X-API-Version', '2')
        return response
      }
      
      // Cache miss
      const response = NextResponse.json({
        items: [],
        hasMore: false,
        totalCached: 0
      })
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
      response.headers.set('X-Cache-Status', 'CF-MISS')
      response.headers.set('X-API-Version', '2')
      return response
    }

    // Genre ranking
    const data = await getGenreRanking(genre, period as RankingPeriod)
    
    if (data && data.items && data.items.length > 0) {
      // Limit to 500 items maximum
      const maxItems = 500
      const items = data.items.slice(0, maxItems)
      
      const response = NextResponse.json({
        items: items,
        popularTags: data.popularTags || [],
        hasMore: false,
        totalCached: data.items.length
      })
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
      response.headers.set('X-Cache-Status', 'CF-HIT')
      response.headers.set('X-Max-Items', String(maxItems))
      response.headers.set('X-API-Version', '2')
      return response
    }
    
    // Cache miss
    const response = NextResponse.json({
      items: [],
      popularTags: [],
      hasMore: false,
      totalCached: 0
    })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    response.headers.set('X-Cache-Status', 'CF-MISS')
    response.headers.set('X-API-Version', '2')
    return response
    
  } catch (error) {
    console.error('Edge ranking API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}