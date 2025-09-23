/**
 * Thumbnail Proxy Worker
 * ニコニコ動画のサムネイル画像をプロキシして配信
 * CORSヘッダー付与と帯域最適化を実装
 */

export interface Env {
  R2_BUCKET?: R2Bucket
}

// 許可されるホスト一覧
const ALLOWED_HOSTS = [
  'nicovideo.cdn.nimg.jp',
  'img.cdn.nimg.jp',
  'tn.smilevideo.jp',
  'tn-skr1.smilevideo.jp',
  'tn-skr2.smilevideo.jp',
  'tn-skr3.smilevideo.jp',
  'tn-skr4.smilevideo.jp'
]

function createCORSHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
  }
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

    // GET以外のメソッドは拒否
    if (request.method !== 'GET') {
      return new Response('Method not allowed', {
        status: 405,
        headers: createCORSHeaders()
      })
    }

    // URLパラメータから画像URLを取得
    const imageUrl = url.searchParams.get('url')
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
        status: 400,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    // URL検証
    let targetUrl: URL
    try {
      targetUrl = new URL(imageUrl)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    // ホストの検証
    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: 'URL not allowed' }), {
        status: 403,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    // R2キャッシュチェック（オプション）
    const cacheKey = `thumbnails/${targetUrl.hostname}${targetUrl.pathname}`
    if (env.R2_BUCKET) {
      try {
        const cachedObject = await env.R2_BUCKET.get(cacheKey)
        if (cachedObject) {
          console.log(`[Thumbnail Proxy] Cache hit for ${cacheKey}`)

          const headers = new Headers(createCORSHeaders())
          headers.set('Content-Type', cachedObject.httpMetadata?.contentType || 'image/jpeg')
          headers.set('X-Cache-Status', 'HIT')
          headers.set('ETag', cachedObject.httpEtag || '')

          return new Response(cachedObject.body, {
            status: 200,
            headers
          })
        }
      } catch (error) {
        console.error('[Thumbnail Proxy] R2 read error:', error)
      }
    }

    // 画像を取得
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nicovideo.jp/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      },
      cf: {
        cacheTtl: 86400, // 1 day
        cacheEverything: true
      }
    })

    if (!imageResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch image',
        status: imageResponse.status
      }), {
        status: imageResponse.status,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    // レスポンスヘッダーの準備
    const responseHeaders = new Headers(createCORSHeaders())
    responseHeaders.set('Content-Type', imageResponse.headers.get('Content-Type') || 'image/jpeg')
    responseHeaders.set('X-Cache-Status', 'MISS')

    // R2に保存（非同期、エラーを無視）
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
                originalUrl: imageUrl,
                fetchedAt: new Date().toISOString()
              }
            })
            console.log(`[Thumbnail Proxy] Cached to R2: ${cacheKey}`)
          } catch (error) {
            console.error('[Thumbnail Proxy] R2 write error:', error)
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