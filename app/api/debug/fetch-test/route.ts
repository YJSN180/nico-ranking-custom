import { NextResponse } from 'next/server'
import { fetchNicoRanking } from '@/lib/fetch-rss'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const startTime = Date.now()
    const items = await fetchNicoRanking()
    const fetchTime = Date.now() - startTime
    
    return NextResponse.json({
      success: true,
      fetchTime: `${fetchTime}ms`,
      itemCount: items.length,
      sampleItems: items.slice(0, 3).map((item: any) => ({
        rank: item.rank,
        title: item.title,
        views: item.views,
        id: item.id
      })),
      firstItemTitle: items[0]?.title || 'No data',
      containsMockData: items[0]?.title?.includes('サンプル動画'),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
  }
}