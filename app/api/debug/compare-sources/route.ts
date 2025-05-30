import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const NORMAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export async function GET(request: NextRequest) {
  const debugKey = request.nextUrl.searchParams.get('key')
  if (debugKey !== 'debug-compare-123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results: any = {
      nvapi: { error: null, data: null },
      htmlGooglebot: { error: null, data: null },
      htmlNormal: { error: null, data: null },
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        isVercel: !!process.env.VERCEL,
        region: process.env.VERCEL_REGION || 'unknown'
      }
    }

    // 1. nvAPIから取得
    try {
      const nvapiResponse = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h', {
        headers: {
          'User-Agent': NORMAL_USER_AGENT,
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/',
        }
      })
      
      if (nvapiResponse.ok) {
        const nvapiData = await nvapiResponse.json()
        const items = nvapiData?.data?.items || []
        
        results.nvapi.data = {
          totalItems: items.length,
          sensitiveCount: items.filter((item: any) => 
            item.title?.includes('静電気') || 
            item.title?.includes('Gundam') ||
            item.title?.includes('ドッキリ')
          ).length,
          top5: items.slice(0, 5).map((item: any) => ({
            title: item.title,
            id: item.id
          }))
        }
      } else {
        results.nvapi.error = `Status: ${nvapiResponse.status}`
      }
    } catch (e) {
      results.nvapi.error = e instanceof Error ? e.message : 'Unknown error'
    }

    // 2. HTML (Googlebot UA)から取得
    try {
      const htmlResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja,en;q=0.9',
          'Cookie': 'sensitive_material_status=accept'
        }
      })
      
      if (htmlResponse.ok) {
        const html = await htmlResponse.text()
        
        // data-video-id属性から動画IDを抽出
        const dataIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
        const videoIds: string[] = []
        let match
        while ((match = dataIdPattern.exec(html)) !== null) {
          if (match[1] && !videoIds.includes(match[1])) {
            videoIds.push(match[1])
          }
        }
        
        // センシティブ動画の検索
        const sensitiveCount = [
          '静電気', 'ドッキリ', 'Gundam', 'ジーク・ジオン'
        ].filter(keyword => html.includes(keyword)).length
        
        // meta tagの確認
        const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
        let metaSensitiveCount = 0
        if (metaMatch) {
          try {
            const encodedData = metaMatch[1]
            if (!encodedData) throw new Error('Empty meta content')
            const decodedData = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
            const jsonData = JSON.parse(decodedData)
            const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
            metaSensitiveCount = items.filter((item: any) => 
              item.title?.includes('静電気') || 
              item.title?.includes('Gundam') ||
              item.title?.includes('ドッキリ')
            ).length
          } catch (e) {
            // Ignore parse errors
          }
        }
        
        results.htmlGooglebot.data = {
          htmlLength: html.length,
          videoIdCount: videoIds.length,
          sensitiveInHtml: sensitiveCount,
          sensitiveInMeta: metaSensitiveCount,
          hasMeta: !!metaMatch,
          headers: Object.fromEntries(htmlResponse.headers.entries())
        }
      } else {
        results.htmlGooglebot.error = `Status: ${htmlResponse.status}`
      }
    } catch (e) {
      results.htmlGooglebot.error = e instanceof Error ? e.message : 'Unknown error'
    }

    // 3. HTML (通常のUA)から取得
    try {
      const htmlResponse = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
        headers: {
          'User-Agent': NORMAL_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja,en;q=0.9',
          'Cookie': 'sensitive_material_status=accept'
        }
      })
      
      if (htmlResponse.ok) {
        const html = await htmlResponse.text()
        
        const dataIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
        const videoIds: string[] = []
        let match
        while ((match = dataIdPattern.exec(html)) !== null) {
          if (match[1] && !videoIds.includes(match[1])) {
            videoIds.push(match[1])
          }
        }
        
        const sensitiveCount = [
          '静電気', 'ドッキリ', 'Gundam', 'ジーク・ジオン'
        ].filter(keyword => html.includes(keyword)).length
        
        results.htmlNormal.data = {
          htmlLength: html.length,
          videoIdCount: videoIds.length,
          sensitiveInHtml: sensitiveCount,
          headers: Object.fromEntries(htmlResponse.headers.entries())
        }
      } else {
        results.htmlNormal.error = `Status: ${htmlResponse.status}`
      }
    } catch (e) {
      results.htmlNormal.error = e instanceof Error ? e.message : 'Unknown error'
    }

    return NextResponse.json({
      results,
      summary: {
        nvApiHasSensitive: results.nvapi.data?.sensitiveCount > 0,
        htmlGooglebotHasSensitive: results.htmlGooglebot.data?.sensitiveInHtml > 0,
        htmlNormalHasSensitive: results.htmlNormal.data?.sensitiveInHtml > 0,
        metaHasSensitive: results.htmlGooglebot.data?.sensitiveInMeta > 0
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to compare sources', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}