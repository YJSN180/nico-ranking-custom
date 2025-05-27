import { NextResponse } from 'next/server'

const RSS_URL = 'https://www.nicovideo.jp/ranking/fav/daily/all?rss=2.0&lang=ja-jp'
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
      return NextResponse.json({
        error: `HTTP ${response.status}`,
        statusText: response.statusText,
      }, { status: response.status })
    }

    const xmlText = await response.text()
    
    // 最初の500文字を返す（デバッグ用）
    return NextResponse.json({
      success: true,
      httpStatus: response.status,
      contentType: response.headers.get('content-type'),
      xmlPreview: xmlText.substring(0, 500),
      xmlLength: xmlText.length,
      hasChannel: xmlText.includes('<channel>'),
      hasItem: xmlText.includes('<item>'),
      itemCount: (xmlText.match(/<item>/g) || []).length,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}