import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const RSS_URL = 'https://www.nicovideo.jp/ranking/genre/all?term=24h&rss=2.0&lang=ja-jp'
const GOOGLEBOT_USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'

export async function GET() {
  try {
    const response = await fetch(RSS_URL, {
      headers: {
        'User-Agent': GOOGLEBOT_USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status}`)
    }

    const xmlText = await response.text()
    
    // 最初のアイテムだけを抽出して詳細を確認
    const firstItemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/)
    const firstItem = firstItemMatch ? firstItemMatch[1] : 'No item found'
    
    return NextResponse.json({
      success: true,
      firstItem: firstItem.substring(0, 2000), // 最初の2000文字
      totalLength: xmlText.length,
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