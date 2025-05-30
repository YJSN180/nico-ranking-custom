import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const debugKey = request.nextUrl.searchParams.get('key')
  if (debugKey !== 'debug-html-123') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Googlebot UAを使用してHTMLを取得
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: `HTML fetch failed: ${response.status}`,
        headers: Object.fromEntries(response.headers.entries())
      }, { status: response.status })
    }
    
    const html = await response.text()
    
    // 1. meta tagの存在確認
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    const hasMeta = !!metaMatch
    
    // 2. data-video-id属性から動画IDを抽出
    const dataIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
    const videoIds: string[] = []
    let match
    while ((match = dataIdPattern.exec(html)) !== null) {
      if (match[1] && !videoIds.includes(match[1])) {
        videoIds.push(match[1])
      }
    }
    
    // 3. センシティブ動画の検索
    const sensitiveKeywords = ['静電気', 'ドッキリ', 'Gundam', 'ジーク・ジオン']
    const foundSensitive: any[] = []
    
    for (const keyword of sensitiveKeywords) {
      if (html.includes(keyword)) {
        // キーワードを含む領域を探す
        const keywordIndex = html.indexOf(keyword)
        const contextStart = Math.max(0, keywordIndex - 500)
        const contextEnd = Math.min(html.length, keywordIndex + 500)
        const context = html.substring(contextStart, contextEnd)
        
        // この領域から動画IDを探す
        const localMatch = context.match(/(?:data-video-id="|href="\/watch\/)((?:sm|nm|so)\d+)/)
        if (localMatch) {
          foundSensitive.push({
            keyword,
            videoId: localMatch[1],
            context: context.substring(0, 200) + '...'
          })
        }
      }
    }
    
    // 4. meta tagからデータを解析
    let metaData = null
    let metaSensitiveCount = 0
    if (metaMatch) {
      const encodedData = metaMatch[1]
      if (!encodedData) {
        metaData = { error: 'Empty meta content' }
      } else {
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        
        try {
          const jsonData = JSON.parse(decodedData)
          const items = jsonData?.data?.response?.$getTeibanRanking?.data?.items || []
          metaData = {
            totalItems: items.length,
            sampleItems: items.slice(0, 3).map((item: any) => ({
              title: item.title,
              id: item.id
            }))
          }
          
          metaSensitiveCount = items.filter((item: any) => 
            sensitiveKeywords.some(keyword => item.title?.includes(keyword))
          ).length
        } catch (e) {
          metaData = { error: 'Failed to parse meta data' }
        }
      }
    }
    
    // 5. 通常のHTML要素からタイトルを探す
    const titlePattern = /<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</gi
    const titles: string[] = []
    let titleMatch
    while ((titleMatch = titlePattern.exec(html)) !== null && titles.length < 20) {
      if (titleMatch[1]) {
        const title = titleMatch[1].trim()
        if (title && !titles.includes(title)) {
          titles.push(title)
        }
      }
    }
    
    return NextResponse.json({
      htmlInfo: {
        length: html.length,
        hasMeta,
        hasDataVideoIds: videoIds.length > 0,
        videoIdCount: videoIds.length,
        sampleVideoIds: videoIds.slice(0, 5)
      },
      sensitiveSearch: {
        foundCount: foundSensitive.length,
        found: foundSensitive
      },
      metaData: {
        exists: hasMeta,
        data: metaData,
        sensitiveInMeta: metaSensitiveCount
      },
      htmlTitles: {
        count: titles.length,
        samples: titles.slice(0, 10),
        hasSensitive: titles.some(title => 
          sensitiveKeywords.some(keyword => title.includes(keyword))
        )
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to scrape HTML', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}