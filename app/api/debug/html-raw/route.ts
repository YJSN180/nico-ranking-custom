import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const url = 'https://www.nicovideo.jp/ranking/genre/all?term=24h'
    
    // 1. Test with different cookie combinations
    const tests = [
      {
        name: 'Googlebot + sensitive cookie',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Cookie': 'sensitive_material_status=accept'
        }
      },
      {
        name: 'Normal UA + sensitive cookie',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': 'sensitive_material_status=accept'
        }
      },
      {
        name: 'Googlebot + no cookie',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        }
      }
    ]
    
    const results = []
    
    for (const test of tests) {
      const response = await fetch(url, { headers: test.headers })
      const html = await response.text()
      
      // Check for sensitive videos in HTML
      const hasStaticElec = html.includes('静電気ドッキリ')
      const hasGundam = html.includes('Gundam G')
      
      // Count video IDs
      const dataIdMatches = html.match(/data-video-id="((?:sm|nm|so)\d+)"/g) || []
      const hrefMatches = html.match(/href="\/watch\/((?:sm|nm|so)\d+)"/g) || []
      
      // Check meta tag
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      let metaVideoCount = 0
      let metaHasSensitive = false
      
      if (metaMatch) {
        try {
          const encodedData = metaMatch[1]!
          const decodedData = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
          const jsonData = JSON.parse(decodedData)
          const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
          metaVideoCount = items.length
          metaHasSensitive = items.some((item: any) => 
            item.title?.includes('静電気') || item.title?.includes('Gundam')
          )
        } catch (e) {
          // Parse error
        }
      }
      
      // Check if HTML contains actual video elements
      const videoElements = html.match(/<article[^>]*class="[^"]*RankingMainVideo[^"]*"[^>]*>/g) || []
      
      results.push({
        test: test.name,
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type'),
          'cache-control': response.headers.get('cache-control')
        },
        html: {
          length: html.length,
          hasStaticElec,
          hasGundam,
          dataIdCount: dataIdMatches.length,
          hrefCount: hrefMatches.length,
          videoElementCount: videoElements.length
        },
        metaTag: {
          exists: !!metaMatch,
          videoCount: metaVideoCount,
          hasSensitive: metaHasSensitive
        }
      })
    }
    
    // Get specific video IDs if found
    const bestTest = results.find(r => r.html.hasStaticElec || r.html.hasGundam) || results[0]
    if (bestTest) {
      const response = await fetch(url, { headers: tests[0]!.headers })
      const html = await response.text()
      
      // Extract video IDs
      const videoIds = new Set<string>()
      const dataIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
      let match
      while ((match = dataIdPattern.exec(html)) !== null) {
        if (match[1]) videoIds.add(match[1])
      }
      
      // Find sensitive videos
      const staticElecId = Array.from(videoIds).find(id => {
        const blockPattern = new RegExp(`data-video-id="${id}"[\\s\\S]*?静電気`, 'i')
        return blockPattern.test(html)
      })
      
      const gundamId = Array.from(videoIds).find(id => {
        const blockPattern = new RegExp(`data-video-id="${id}"[\\s\\S]*?Gundam`, 'i')
        return blockPattern.test(html)
      })
      
      results.push({
        sensitiveVideoIds: {
          staticElec: staticElecId || 'not found',
          gundam: gundamId || 'not found'
        }
      })
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: {
        vercel: !!process.env.VERCEL,
        region: process.env.VERCEL_REGION || 'unknown'
      },
      results
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}