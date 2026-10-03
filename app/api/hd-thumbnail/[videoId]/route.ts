import { NextRequest, NextResponse } from 'next/server'
import { isThumbnailCdnUrl } from '@/lib/thumbnail-hosts'
import { decodeHtmlAttribute } from '@/lib/html-entities'

// 1 か所の取得（本文の読み取りを含む）の期限。ミラーが遅くても nicovideo.jp を読む時間を残す
const SOURCE_TIMEOUT_MS = 4_000

// .M / .L を外し、.original を付けて最大サイズの URL にする
function toOriginalSizeUrl(thumbnailUrl: string): string {
  const [urlBase = '', urlQuery] = thumbnailUrl.split('?')
  let originalUrl = urlBase.replace(/\.(M|L)($|\/)/g, '$2')
  if (!originalUrl.includes('.original')) {
    originalUrl = originalUrl.replace(/(\.\d+)($|\/)/g, '$1.original$2')
  }
  return urlQuery ? `${originalUrl}?${urlQuery}` : originalUrl
}

/**
 * og:image（無ければ thumbnail の meta）から HD サムネイルの URL を取り出す。
 * ページの値は信用しない: ニコニコの画像 CDN の https URL でなければ採用しない
 * （利用者はこの URL をプロキシ経由で保存し、だめなら新しいタブで開く）
 */
function extractHdThumbnailUrl(html: string): string | null {
  // og:image メタタグから1280x720サムネイルURL取得
  // 属性の順序が異なる場合も対応（content が先にくる場合）
  const ogImageMatch = html.match(/<meta[^>]+(?:property=["']og:image["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+property=["']og:image["'])/i)
  const ogImage = ogImageMatch ? decodeHtmlAttribute(ogImageMatch[1] || ogImageMatch[2]) : undefined

  if (ogImage && isThumbnailCdnUrl(ogImage)) {
    // eslint-disable-next-line no-console
    console.log(`[HD Thumbnail] Found og:image: ${ogImage}`)
    // サムネイルURLの検証（1280x720であることを確認）
    if (ogImage.includes('1280x720') || ogImage.includes('.original')) {
      return ogImage
    }
    // フォールバック: .original サフィックスで最大サイズ取得を試行
    return toOriginalSizeUrl(ogImage)
  }

  // フォールバック: og:imageが（使える形で）見つからない場合
  const thumbnailMatch = html.match(/<meta[^>]+name=["']thumbnail["'][^>]+content=["']([^"']+)["']/i)
  const thumbnail = thumbnailMatch ? decodeHtmlAttribute(thumbnailMatch[1]) : undefined
  if (thumbnail && isThumbnailCdnUrl(thumbnail)) {
    // .original サフィックス追加で最大サイズ化
    return toOriginalSizeUrl(thumbnail)
  }

  return null
}

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
    
    let hdThumbnailUrl: string | null = null
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
          },
          signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS)
        })
        
        if (response.ok) {
          hdThumbnailUrl = extractHdThumbnailUrl(await response.text())
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(`[HD Thumbnail] nicovideo.gay failed for ${videoId}, trying direct access`)
      }
    }
    
    // Fallback to direct nicovideo.jp access for "so" videos or when nicovideo.gay fails
    // （失敗・期限切れのほか、使える URL が無かったときも。ミラーの 200 の空ページで諦めない）
    if (!hdThumbnailUrl) {
      const nicovideoUrl = `https://www.nicovideo.jp/watch/${videoId}`
      source = 'nicovideo.jp'
      
      const response = await fetch(nicovideoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS)
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from nicovideo.jp: ${response.status}`)
      }
      
      hdThumbnailUrl = extractHdThumbnailUrl(await response.text())
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