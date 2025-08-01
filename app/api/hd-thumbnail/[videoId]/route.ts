import { NextRequest, NextResponse } from 'next/server'

/**
 * HD サムネイル取得API (1280x720)
 * nicovideo.gay からのog:image取得によるテスト実装
 * "so"動画の場合は直接ニコニコ動画から取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params
    
    if (!videoId || !/^[a-zA-Z0-9]+$/.test(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      )
    }
    
    // eslint-disable-next-line no-console
    console.log(`[HD Thumbnail] Fetching HD thumbnail for ${videoId}`)
    
    let html = ''
    let source = 'nicovideo.gay'
    
    // Try nicovideo.gay first for non-so videos
    if (!videoId.startsWith('so')) {
      const nicogayUrl = `https://www.nicovideo.gay/watch/${videoId}`
      
      try {
        const response = await fetch(nicogayUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept-Language': 'ja,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        })
        
        if (response.ok) {
          html = await response.text()
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(`[HD Thumbnail] nicovideo.gay failed for ${videoId}, trying direct access`)
      }
    }
    
    // Fallback to direct nicovideo.jp access for "so" videos or when nicovideo.gay fails
    if (!html || videoId.startsWith('so')) {
      const nicovideoUrl = `https://www.nicovideo.jp/watch/${videoId}`
      source = 'nicovideo.jp'
      
      const response = await fetch(nicovideoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from nicovideo.jp: ${response.status}`)
      }
      
      html = await response.text()
    }
    
    // og:image メタタグから1280x720サムネイルURL取得
    // 属性の順序が異なる場合も対応（content が先にくる場合）
    const ogImageMatch = html.match(/<meta[^>]+(?:property=["']og:image["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+property=["']og:image["'])/i)
    let hdThumbnailUrl = null
    
    if (ogImageMatch) {
      hdThumbnailUrl = ogImageMatch[1] || ogImageMatch[2]
      // eslint-disable-next-line no-console
      console.log(`[HD Thumbnail] Found og:image: ${hdThumbnailUrl}`)
      
      // サムネイルURLの検証（1280x720であることを確認）
      if (hdThumbnailUrl.includes('1280x720') || hdThumbnailUrl.includes('.original')) {
        // eslint-disable-next-line no-console
        console.log(`[HD Thumbnail] Confirmed HD size for ${videoId}`)
      } else {
        // フォールバック: .original サフィックスで最大サイズ取得を試行
        const [urlBase, urlQuery] = hdThumbnailUrl.split('?')
        let originalUrl = urlBase.replace(/\.(M|L)($|\/)/g, '$2')
        if (!originalUrl.includes('.original')) {
          originalUrl = originalUrl.replace(/(\.\d+)($|\/)/g, '$1.original$2')
        }
        hdThumbnailUrl = urlQuery ? `${originalUrl}?${urlQuery}` : originalUrl
        // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
        console.log(`[HD Thumbnail] Fallback thumbnail with original: ${hdThumbnailUrl}`)
      }
    }
    
    const result = {
      videoId,
      thumbnail: hdThumbnailUrl,
      resolution: hdThumbnailUrl ? '1280x720 (HD)' : 'Not available',
      source: `${source} og:image`,
      timestamp: new Date().toISOString()
    }
    
    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-HD-Source': source
      }
    })
    
  } catch (error) {
    const resolvedParams = await params
    console.error(`[HD Thumbnail] Error for ${resolvedParams.videoId}:`, error)
    
    return NextResponse.json({
      error: 'Failed to fetch HD thumbnail',
      videoId: resolvedParams.videoId,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}