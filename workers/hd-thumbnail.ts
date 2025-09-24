/**
 * HD Thumbnail Worker
 * ニコニコ動画の高画質サムネイル（1280x720）取得
 * OGP画像を活用した実装
 */

export interface Env {
  R2_BUCKET?: R2Bucket
}

function createCORSHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400'
  }
}

async function extractOGImage(html: string): Promise<string | null> {
  // og:imageタグを正規表現で抽出
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
  if (ogImageMatch && ogImageMatch[1]) {
    return ogImageMatch[1]
  }

  // Twitter画像も探す
  const twitterImageMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)
  if (twitterImageMatch && twitterImageMatch[1]) {
    return twitterImageMatch[1]
  }

  return null
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // OPTIONS request handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createCORSHeaders()
      })
    }

    // パスから動画IDを取得 (/api/hd-thumbnail/sm12345 形式)
    const pathMatch = url.pathname.match(/\/([a-zA-Z0-9]+)$/)
    if (!pathMatch || !pathMatch[1]) {
      return new Response(JSON.stringify({ error: 'Invalid video ID' }), {
        status: 400,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    const videoId = pathMatch[1]
    console.log(`[HD Thumbnail] Fetching HD thumbnail for ${videoId}`)

    // R2キャッシュチェック
    const cacheKey = `hd-thumbnails/${videoId}.jpg`
    if (env.R2_BUCKET) {
      try {
        const cachedObject = await env.R2_BUCKET.get(cacheKey)
        if (cachedObject) {
          console.log(`[HD Thumbnail] Cache hit for ${videoId}`)

          const headers = new Headers(createCORSHeaders())
          headers.set('Content-Type', cachedObject.httpMetadata?.contentType || 'image/jpeg')
          headers.set('X-Cache-Status', 'HIT')
          headers.set('X-Source', 'r2-cache')

          return new Response(cachedObject.body, {
            status: 200,
            headers
          })
        }
      } catch (error) {
        console.error('[HD Thumbnail] R2 read error:', error)
      }
    }

    let hdImageUrl: string | null = null
    let source = 'unknown'

    // Strategy 1: Try nicovideo.gay for non-so videos
    if (!videoId.startsWith('so')) {
      try {
        const nicogayUrl = `https://www.nicovideo.gay/watch/${videoId}`
        const response = await fetch(nicogayUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          cf: {
            cacheTtl: 3600, // 1 hour
            cacheEverything: true
          }
        })

        if (response.ok) {
          const html = await response.text()
          hdImageUrl = await extractOGImage(html)
          if (hdImageUrl) {
            source = 'nicovideo.gay'
            console.log(`[HD Thumbnail] Found HD image from nicovideo.gay: ${hdImageUrl}`)
          }
        }
      } catch (error) {
        console.log(`[HD Thumbnail] nicovideo.gay failed for ${videoId}:`, error)
      }
    }

    // Strategy 2: Try direct nicovideo.jp
    if (!hdImageUrl || videoId.startsWith('so')) {
      try {
        const nicovideoUrl = `https://www.nicovideo.jp/watch/${videoId}`
        const response = await fetch(nicovideoUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          cf: {
            cacheTtl: 3600,
            cacheEverything: true
          }
        })

        if (response.ok) {
          const html = await response.text()
          hdImageUrl = await extractOGImage(html)
          if (hdImageUrl) {
            source = 'nicovideo.jp'
            console.log(`[HD Thumbnail] Found HD image from nicovideo.jp: ${hdImageUrl}`)
          }
        }
      } catch (error) {
        console.log(`[HD Thumbnail] nicovideo.jp failed for ${videoId}:`, error)
      }
    }

    if (!hdImageUrl) {
      return new Response(JSON.stringify({
        error: 'HD thumbnail not found',
        videoId
      }), {
        status: 404,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json',
          'X-Source': source
        }
      })
    }

    // HD画像を取得
    const imageResponse = await fetch(hdImageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nicovideo.jp/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      },
      cf: {
        polish: 'lossless', // 画像最適化
        cacheTtl: 86400,
        cacheEverything: true
      }
    })

    if (!imageResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch HD image',
        status: imageResponse.status
      }), {
        status: 502,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    const responseHeaders = new Headers(createCORSHeaders())
    responseHeaders.set('Content-Type', imageResponse.headers.get('Content-Type') || 'image/jpeg')
    responseHeaders.set('X-Cache-Status', 'MISS')
    responseHeaders.set('X-Source', source)

    // R2に保存（非同期）
    if (env.R2_BUCKET && imageResponse.body) {
      const [body1, body2] = imageResponse.body.tee()

      ctx.waitUntil(
        (async () => {
          try {
            await env.R2_BUCKET.put(cacheKey, body2, {
              httpMetadata: {
                contentType: imageResponse.headers.get('Content-Type') || 'image/jpeg'
              },
              customMetadata: {
                originalUrl: hdImageUrl,
                source,
                videoId,
                fetchedAt: new Date().toISOString()
              }
            })
            console.log(`[HD Thumbnail] Cached to R2: ${cacheKey}`)
          } catch (error) {
            console.error('[HD Thumbnail] R2 write error:', error)
          }
        })()
      )

      return new Response(body1, {
        status: 200,
        headers: responseHeaders
      })
    }

    return new Response(imageResponse.body, {
      status: 200,
      headers: responseHeaders
    })
  }
}