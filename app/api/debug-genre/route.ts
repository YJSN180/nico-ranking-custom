import { NextRequest, NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get('genre') || 'vocaloid'
  
  try {
    console.log(`Testing genre: ${genre}`)
    
    // Test direct scraping
    const result = await scrapeRankingPage(genre, '24h')
    
    // Test nvAPI URL
    const nvApiUrl = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genre}?term=24h`
    const htmlUrl = `https://www.nicovideo.jp/ranking/genre/${genre}?term=24h`
    
    return NextResponse.json({
      genre,
      nvApiUrl,
      htmlUrl,
      totalItems: result.items.length,
      popularTags: result.popularTags,
      top5: result.items.slice(0, 5).map(item => ({
        rank: item.rank,
        title: item.title,
        id: item.id
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ 
      genre,
      error: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}