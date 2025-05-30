import { NextRequest, NextResponse } from 'next/server'
import { completeHybridScrape } from '@/lib/complete-hybrid-scraper'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const genre = request.nextUrl.searchParams.get('genre') || 'all'
    const tag = request.nextUrl.searchParams.get('tag') || undefined
    
    // Test completeHybridScrape directly
    const result = await completeHybridScrape(genre, '24h', tag)
    
    // Check for sensitive videos
    const sensitiveVideos = result.items.filter(item => 
      item.title?.includes('静電気') || 
      item.title?.includes('Gundam') ||
      item.title?.includes('ガンダム')
    )
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      totalItems: result.items.length,
      popularTags: result.popularTags?.length || 0,
      sensitiveCount: sensitiveVideos.length,
      sensitiveVideos: sensitiveVideos.map(v => ({
        rank: v.rank,
        id: v.id,
        title: v.title
      })),
      top5: result.items.slice(0, 5).map(item => ({
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