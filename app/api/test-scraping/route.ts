import { NextResponse } from 'next/server'

export async function GET() {
  const GOOGLEBOT_USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'
  const url = 'https://www.nicovideo.jp/ranking/genre/game?term=24h'
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': GOOGLEBOT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      }
    })
    
    const result: any = {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok
    }
    
    if (!response.ok) {
      const text = await response.text()
      result.errorBody = text.substring(0, 1000)
      return NextResponse.json(result)
    }
    
    const html = await response.text()
    result.htmlLength = html.length
    result.firstChars = html.substring(0, 1000)
    
    // ランキングアイテムを探す
    const rankingItemMatches = html.match(/<li[^>]+class="[^"]*RankingVideo[^"]*"/g)
    result.rankingItemsFound = rankingItemMatches ? rankingItemMatches.length : 0
    
    // 人気タグを探す
    const tagMatches = html.match(/<a[^>]+href="\/tag\/[^"]+"/g)
    result.tagLinksFound = tagMatches ? tagMatches.length : 0
    
    // タイトルを探す
    const titleMatches = html.match(/data-title="[^"]+"/g)
    result.titlesFound = titleMatches ? titleMatches.length : 0
    
    // 403エラーチェック
    result.contains403 = html.includes('403') || html.includes('Forbidden')
    result.containsGeoBlock = html.includes('geo') || html.includes('region') || html.includes('地域')
    
    return NextResponse.json(result)
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
  }
}