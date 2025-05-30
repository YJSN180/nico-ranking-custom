import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { completeHybridScrape } from '@/lib/complete-hybrid-scraper'
import { scrapeRankingPage } from '@/lib/scraper'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Simple auth check
  const debugKey = request.nextUrl.searchParams.get('key')
  if (debugKey !== 'debug-sensitive-123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const genre = request.nextUrl.searchParams.get('genre') || 'all'
  const tag = request.nextUrl.searchParams.get('tag') || undefined

  try {
    // 1. completeHybridScrapeで直接データを取得
    const hybridData = await completeHybridScrape(genre, '24h', tag)
    
    // センシティブ動画を検索
    const sensitiveVideos = hybridData.items.filter(item => 
      item.title?.includes('静電気') || 
      item.title?.includes('Gundam') ||
      item.title?.includes('ドッキリ')
    )

    // 2. KVからデータを取得
    const cacheKey = tag ? `ranking-${genre}-tag-${encodeURIComponent(tag)}` : `ranking-${genre}`
    const kvData = await kv.get(cacheKey)
    
    let kvSensitiveCount = 0
    if (kvData) {
      const items = Array.isArray(kvData) ? kvData : (kvData as any).items || []
      const kvSensitiveVideos = items.filter((item: any) => 
        item.title?.includes('静電気') || 
        item.title?.includes('Gundam') ||
        item.title?.includes('ドッキリ')
      )
      kvSensitiveCount = kvSensitiveVideos.length
    }

    // 3. scrapeRankingPageで取得
    const scraperData = await scrapeRankingPage(genre, '24h', tag)
    const scraperSensitiveVideos = scraperData.items.filter(item => 
      item.title?.includes('静電気') || 
      item.title?.includes('Gundam') ||
      item.title?.includes('ドッキリ')
    )

    // 4. APIルートから取得
    const apiUrl = new URL('/api/ranking', request.url)
    apiUrl.searchParams.set('genre', genre)
    if (tag) apiUrl.searchParams.set('tag', tag)
    
    const apiResponse = await fetch(apiUrl.toString())
    const apiData = await apiResponse.json()
    
    let apiSensitiveCount = 0
    if (apiData) {
      const items = Array.isArray(apiData) ? apiData : apiData.items || []
      const apiSensitiveVideos = items.filter((item: any) => 
        item.title?.includes('静電気') || 
        item.title?.includes('Gundam') ||
        item.title?.includes('ドッキリ')
      )
      apiSensitiveCount = apiSensitiveVideos.length
    }

    // 結果をまとめる
    return NextResponse.json({
      genre,
      tag,
      results: {
        hybridScrape: {
          totalItems: hybridData.items.length,
          sensitiveCount: sensitiveVideos.length,
          sensitiveVideos: sensitiveVideos.map(v => ({
            rank: v.rank,
            id: v.id,
            title: v.title
          }))
        },
        kvCache: {
          exists: !!kvData,
          sensitiveCount: kvSensitiveCount
        },
        scrapeRankingPage: {
          totalItems: scraperData.items.length,
          sensitiveCount: scraperSensitiveVideos.length,
          sensitiveVideos: scraperSensitiveVideos.map(v => ({
            rank: v.rank,
            id: v.id,
            title: v.title
          }))
        },
        apiRoute: {
          sensitiveCount: apiSensitiveCount
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to debug sensitive videos', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}