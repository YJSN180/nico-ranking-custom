import { NextRequest, NextResponse } from 'next/server'
import { getGenreRanking } from '@/lib/cloudflare-kv'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

export const runtime = 'edge'

const GENRE_POPULARITY_ORDER: RankingGenre[] = [
  'all', 'game', 'entertainment', 'anime', 'music', 
  'vocaloid', 'sing', 'dance', 'play', 'other',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'voicesynthesis', 'animal'
]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'

  // Validate period
  const validPeriods = ['24h', 'hour']
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }

  try {
    // Try to get popular tags from KV
    const data = await getGenreRanking(genre, period as RankingPeriod)
    
    if (data && data.popularTags && data.popularTags.length > 0) {
      const response = NextResponse.json({ tags: data.popularTags })
      response.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')
      response.headers.set('X-Cache-Status', 'CF-HIT')
      return response
    }
    
    // Cache miss - return empty array
    const response = NextResponse.json({ tags: [] })
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    response.headers.set('X-Cache-Status', 'CF-MISS')
    return response
    
  } catch (error) {
    console.error('Edge popular tags API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch popular tags' },
      { status: 500 }
    )
  }
}