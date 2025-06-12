import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'
import { kv } from '@/lib/simple-kv'

export const runtime = 'nodejs'

export async function GET() {
  try {
    // 1. Direct scraping result
    const scrapedData = await scrapeRankingPage('all', '24h')
    const scrapedSensitive = scrapedData.items.filter((item: any) => 
      item.title?.includes('静電気') || item.title?.includes('Gundam')
    )
    
    // 2. Check KV cache
    let kvData = null
    let kvSensitive = []
    try {
      const cached = await kv.get('ranking-all')
      if (cached && typeof cached === 'object' && 'items' in cached) {
        kvData = cached as any
        kvSensitive = kvData.items.filter((item: any) => 
          item.title?.includes('静電気') || item.title?.includes('Gundam')
        )
      }
    } catch (e) {
      // Ignore KV errors
    }
    
    // 3. Direct HTML fetch
    const htmlResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    const html = await htmlResponse.text()
    const htmlHasStaticElec = html.includes('静電気ドッキリ')
    const htmlHasGundam = html.includes('Gundam G')
    
    // 4. Check meta tag
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    let metaSensitive = 0
    if (metaMatch) {
      const encodedData = metaMatch[1]!
      const decodedData = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      try {
        const jsonData = JSON.parse(decodedData)
        const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
        metaSensitive = items.filter((item: any) => 
          item.title?.includes('静電気') || item.title?.includes('Gundam')
        ).length
      } catch (e) {
        // Parse error
      }
    }
    
    return NextResponse.json({
      scrapedData: {
        totalItems: scrapedData.items.length,
        sensitiveCount: scrapedSensitive.length,
        sensitiveItems: scrapedSensitive.map((item: any) => ({
          title: item.title,
          id: item.id,
          rank: item.rank
        }))
      },
      kvCache: {
        hasData: !!kvData,
        totalItems: kvData?.items?.length || 0,
        sensitiveCount: kvSensitive.length,
        sensitiveItems: kvSensitive.map((item: any) => ({
          title: item.title,
          id: item.id,
          rank: item.rank
        }))
      },
      htmlFetch: {
        hasStaticElec: htmlHasStaticElec,
        hasGundam: htmlHasGundam,
        metaSensitiveCount: metaSensitive
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}