import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre')
  const period = searchParams.get('period') as RankingPeriod | null
  const tag = searchParams.get('tag')
  const limit = parseInt(searchParams.get('limit') || '100', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  // Validate inputs
  if (!genre) {
    return NextResponse.json({ error: 'genre parameter is required' }, { status: 400 })
  }

  if (!period || !['24h', 'hour'].includes(period)) {
    return NextResponse.json({ error: 'period must be either "24h" or "hour"' }, { status: 400 })
  }

  try {
    let items: any[] = []
    let popularTags: string[] = []

    if (tag) {
      // Fetch tag-specific ranking
      const tagItems = await getTagRanking(genre, period, tag)
      
      if (!tagItems) {
        return NextResponse.json(
          { error: 'Tag ranking not found' },
          { status: 404 }
        )
      }

      items = tagItems
    } else {
      // Fetch genre ranking
      const genreData = await getGenreRanking(genre, period)
      
      if (!genreData) {
        return NextResponse.json(
          { error: 'Genre ranking not found' },
          { status: 404 }
        )
      }

      items = genreData.items
      popularTags = genreData.popularTags
    }

    // Apply pagination
    const paginatedItems = items.slice(offset, offset + limit)
    const hasMore = offset + limit < items.length

    const responseData: any = {
      items: paginatedItems,
      hasMore,
      total: items.length,
    }

    // Include popular tags only for first page of non-tag requests
    if (!tag && offset === 0 && popularTags.length > 0) {
      responseData.popularTags = popularTags
    }

    const response = NextResponse.json(responseData)
    
    // Set cache headers
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    response.headers.set('X-Data-Source', 'cloudflare-kv')
    
    return response
  } catch (error) {
    console.error('[API] Error fetching from Cloudflare KV:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}