import { NextRequest, NextResponse } from 'next/server'

/**
 * HD サムネイル取得API (1280x720)
 * nicovideo.gay からのog:image取得によるテスト実装
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    const { videoId } = params
    
    if (!videoId || !/^[a-zA-Z0-9]+$/.test(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      )
    }
    
    console.log(`[HD Thumbnail] Fetching HD thumbnail for ${videoId}`)
    const nicogayUrl = `https://www.nicovideo.gay/watch/${videoId}`
    
    const response = await fetch(nicogayUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept-Language': 'ja,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from nicovideo.gay: ${response.status}`)
    }
    
    const html = await response.text()
    
    // og:image メタタグから1280x720サムネイルURL取得
    // 属性の順序が異なる場合も対応（content が先にくる場合）
    const ogImageMatch = html.match(/<meta[^>]+(?:property=["']og:image["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+property=["']og:image["'])/i)
    let hdThumbnailUrl = null
    
    if (ogImageMatch) {
      hdThumbnailUrl = ogImageMatch[1] || ogImageMatch[2]
      console.log(`[HD Thumbnail] Found og:image: ${hdThumbnailUrl}`)
      
      // サムネイルURLの検証（1280x720であることを確認）
      if (hdThumbnailUrl.includes('1280x720') || hdThumbnailUrl.includes('.original')) {
        console.log(`[HD Thumbnail] Confirmed HD size for ${videoId}`)
      } else {
        // フォールバック: .original サフィックスで最大サイズ取得を試行
        const [urlBase, urlQuery] = hdThumbnailUrl.split('?')
        let originalUrl = urlBase.replace(/\.(M|L)($|\/)/g, '$2')
        if (!originalUrl.includes('.original')) {
          originalUrl = originalUrl.replace(/(\.\d+)($|\/)/g, '$1.original$2')
        }
        hdThumbnailUrl = urlQuery ? `${originalUrl}?${urlQuery}` : originalUrl
        console.log(`[HD Thumbnail] Fallback to original: ${hdThumbnailUrl}`)
      }
    }
    
    // フォールバック: og:imageが見つからない場合
    if (!hdThumbnailUrl) {
      const thumbnailMatch = html.match(/<meta[^>]+name=["']thumbnail["'][^>]+content=["']([^"']+)["']/i)
      if (thumbnailMatch) {
        hdThumbnailUrl = thumbnailMatch[1]
        // .original サフィックス追加で最大サイズ化
        const [urlBase, urlQuery] = hdThumbnailUrl.split('?')
        let originalUrl = urlBase.replace(/\.(M|L)($|\/)/g, '$2')
        if (!originalUrl.includes('.original')) {
          originalUrl = originalUrl.replace(/(\.\d+)($|\/)/g, '$1.original$2')
        }
        hdThumbnailUrl = urlQuery ? `${originalUrl}?${urlQuery}` : originalUrl
        console.log(`[HD Thumbnail] Fallback thumbnail with original: ${hdThumbnailUrl}`)
      }
    }
    
    const result = {
      videoId,
      thumbnail: hdThumbnailUrl,
      resolution: hdThumbnailUrl ? '1280x720 (HD)' : 'Not available',
      source: 'nicovideo.gay og:image',
      timestamp: new Date().toISOString()
    }
    
    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-HD-Source': 'nicovideo.gay'
      }
    })
    
  } catch (error) {
    console.error(`[HD Thumbnail] Error for ${params.videoId}:`, error)
    
    return NextResponse.json({
      error: 'Failed to fetch HD thumbnail',
      videoId: params.videoId,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}