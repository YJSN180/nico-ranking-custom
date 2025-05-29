import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'

export async function GET() {
  try {
    // r18ジャンルのテスト
    const result = await scrapeRankingPage('r18', '24h')
    
    return NextResponse.json({
      success: true,
      genre: 'r18',
      itemCount: result.items.length,
      popularTags: result.popularTags,
      sampleItems: result.items.slice(0, 5).map(item => ({
        rank: item.rank,
        id: item.id,
        title: item.title,
        hasAuthorInfo: !!(item.authorName && item.authorIcon)
      }))
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}