import { NextRequest, NextResponse } from 'next/server'
import { fetchRanking } from '@/lib/complete-hybrid-scraper'
import type { RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const genre = request.nextUrl.searchParams.get('genre') || 'all'
    const tag = request.nextUrl.searchParams.get('tag') || undefined
    
    // Test fetchRanking directly
    const rankingData = await fetchRanking(genre, tag || null, '24h')
    const result = {
      items: rankingData.items,
      popularTags: rankingData.popularTags
    }
    
    // Check for sensitive videos
    const sensitiveVideos = result.items.filter((item: RankingItem) => 
      item.title?.includes('静電気') || 
      item.title?.includes('Gundam') ||
      item.title?.includes('ガンダム')
    )
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      totalItems: result.items.length,
      popularTags: result.popularTags?.length || 0,
      sensitiveCount: sensitiveVideos.length,
      sensitiveVideos: sensitiveVideos.map((v: RankingItem) => ({
        rank: v.rank,
        id: v.id,
        title: v.title
      })),
      top5: result.items.slice(0, 5).map((item: RankingItem) => ({
        rank: item.rank,
        id: item.id,
        title: item.title
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}