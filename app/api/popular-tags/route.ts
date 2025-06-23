import { NextRequest, NextResponse } from 'next/server'
import { getPopularTags } from '@/lib/popular-tags'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { getCacheHeaders } from '@/lib/cache-durations'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const genre = searchParams.get('genre') as RankingGenre || 'all'
  const period = searchParams.get('period') as RankingPeriod || '24h'
  
  try {
    const tags = await getPopularTags(genre, period)
    
    return NextResponse.json({ tags }, {
      headers: {
        'Cache-Control': getCacheHeaders('popular-tags')
      }
    })
  } catch (error) {
    return NextResponse.json({ tags: [] }, {
      status: 200, // エラーでも200を返して空配列を返す
      headers: {
        'Cache-Control': getCacheHeaders('popular-tags')
      }
    })
  }
}