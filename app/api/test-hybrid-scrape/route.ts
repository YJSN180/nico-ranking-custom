import { NextResponse } from 'next/server'
import { completeHybridScrape } from '@/lib/complete-hybrid-scraper'

export const runtime = 'nodejs'

export async function GET() {
  try {
    // Test completeHybridScrape directly
    const result = await completeHybridScrape('all', '24h')
    
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