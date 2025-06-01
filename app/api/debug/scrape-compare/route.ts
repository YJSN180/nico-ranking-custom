import { NextRequest, NextResponse } from 'next/server'
import { fetchRanking } from '@/lib/complete-hybrid-scraper'
import { cookieScrapeRanking } from '@/lib/cookie-scraper'
import type { RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get('genre') || 'all'
  
  try {
    const results: any = {
      genre,
      timestamp: new Date().toISOString()
    }
    
    // 1. Test fetchRanking (formerly completeHybridScrape)
    try {
      const rankingData = await fetchRanking(genre, null, '24h')
      const sensitiveItems = rankingData.items.filter((item: RankingItem) => 
        item.title?.includes('静電気') || item.title?.includes('Gundam')
      )
      
      results.hybridScrape = {
        success: true,
        itemCount: rankingData.items.length,
        popularTagCount: rankingData.popularTags?.length || 0,
        sensitiveCount: sensitiveItems.length,
        sensitiveItems: sensitiveItems.map((item: RankingItem) => ({
          title: item.title,
          id: item.id,
          rank: item.rank
        })),
        top5: rankingData.items.slice(0, 5).map((item: RankingItem) => ({
          rank: item.rank,
          title: item.title,
          id: item.id
        }))
      }
    } catch (error: any) {
      results.hybridScrape = { success: false, error: error.message }
    }
    
    // 2. Test cookieScrapeRanking (if genre is 'all')
    if (genre === 'all') {
      try {
        const cookieResult = await cookieScrapeRanking(genre, '24h')
        const sensitiveItems = cookieResult.items.filter((item: RankingItem) => 
          item.title?.includes('静電気') || item.title?.includes('Gundam')
        )
        
        results.cookieScrape = {
          success: cookieResult.success,
          itemCount: cookieResult.items.length,
          sensitiveCount: sensitiveItems.length,
          sensitiveItems: sensitiveItems.map((item: RankingItem) => ({
            title: item.title,
            id: item.id,
            rank: item.rank
          })),
          top5: cookieResult.items.slice(0, 5).map((item: RankingItem) => ({
            rank: item.rank,
            title: item.title,
            id: item.id
          }))
        }
      } catch (error: any) {
        results.cookieScrape = { success: false, error: error.message }
      }
    }
    
    // 3. Direct HTML fetch test
    try {
      const response = await fetch(`https://www.nicovideo.jp/ranking/genre/${genre}?term=24h`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Cookie': 'sensitive_material_status=accept'
        }
      })
      
      const html = await response.text()
      
      results.directHtml = {
        status: response.status,
        htmlLength: html.length,
        hasStaticElec: html.includes('静電気ドッキリ'),
        hasGundam: html.includes('Gundam G'),
        hasMetaTag: html.includes('<meta name="server-response"'),
        videoIdCount: (html.match(/data-video-id="/g) || []).length
      }
    } catch (error: any) {
      results.directHtml = { error: error.message }
    }
    
    // 4. Test nvAPI directly
    try {
      const response = await fetch(`https://nvapi.nicovideo.jp/v1/ranking/genre/${genre}?term=24h`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        const items = data.data?.items || []
        const sensitiveItems = items.filter((item: any) => 
          item.title?.includes('静電気') || item.title?.includes('Gundam')
        )
        
        results.nvApi = {
          success: true,
          status: data.meta?.status,
          itemCount: items.length,
          sensitiveCount: sensitiveItems.length,
          sensitiveItems: sensitiveItems.map((item: any) => ({
            title: item.title,
            id: item.id
          }))
        }
      } else {
        results.nvApi = { success: false, status: response.status }
      }
    } catch (error: any) {
      results.nvApi = { error: error.message }
    }
    
    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}