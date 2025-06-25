/**
 * Cloudflare Worker - API Gateway with R2 Integration v2
 * 動的TTLとETag対応版
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
}

// セキュリティヘッダー定義
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; media-src 'self' https:; object-src 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'on'
}

// 動的CORSヘッダー生成
function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin')
  const allowedOrigins = [
    'http://localhost:3000',
    'https://nico-rank.com',
    'https://nico-ranking-custom-yjsns-projects.vercel.app'
  ]
  
  // Vercelプレビューデプロイメントのパターン
  const vercelPreviewPattern = /^https:\/\/nico-ranking-[a-z0-9-]+\.vercel\.app$/
  
  let allowOrigin = '*' // デフォルト（公開API向け）
  
  if (origin && (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin))) {
    allowOrigin = origin
  }
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Max-Age': '86400'
  }
}

/**
 * 動的TTLを計算（インライン実装）
 */
function calculateDynamicTTL() {
  const now = new Date()
  const currentMinute = now.getMinutes()
  
  // 次の更新時刻を計算
  let nextUpdateMinute: number
  let hoursToAdd = 0
  
  if (currentMinute < 5) {
    nextUpdateMinute = 5
  } else if (currentMinute < 25) {
    nextUpdateMinute = 25
  } else {
    nextUpdateMinute = 5
    hoursToAdd = 1
  }
  
  // 次の更新時刻のDateオブジェクトを作成
  const nextUpdate = new Date(now)
  nextUpdate.setHours(now.getHours() + hoursToAdd)
  nextUpdate.setMinutes(nextUpdateMinute)
  nextUpdate.setSeconds(0)
  nextUpdate.setMilliseconds(0)
  
  // 次の更新時刻までの秒数を計算
  const secondsUntilUpdate = Math.floor((nextUpdate.getTime() - now.getTime()) / 1000)
  
  // TTL値を計算（最低60秒）
  const workersTTL = Math.max(60, secondsUntilUpdate)
  const cdnTTL = Math.max(60, secondsUntilUpdate - 60)
  const browserTTL = Math.max(60, secondsUntilUpdate - 120)
  
  // Cache-Controlヘッダーを生成
  const cacheControl = `public, max-age=${browserTTL}, s-maxage=${cdnTTL}, stale-while-revalidate=86400`
  const cdnCacheControl = `public, max-age=${cdnTTL}`
  
  return {
    cacheControl,
    cdnCacheControl
  }
}

/**
 * ETagが一致するかチェック（簡易版）
 */
function isETagMatch(currentETag: string, ifNoneMatch: string | null): boolean {
  if (!ifNoneMatch) return false
  
  // ワイルドカードの場合
  if (ifNoneMatch.trim() === '*') return true
  
  // weak比較（W/プレフィックスを無視）
  const normalizeETag = (etag: string) => etag.replace(/^W\//, '')
  const normalizedCurrent = normalizeETag(currentETag)
  
  // カンマ区切りのETagリストをチェック
  const etags = ifNoneMatch.split(',').map(e => e.trim())
  return etags.some(etag => normalizeETag(etag) === normalizedCurrent)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // プレビュー環境での認証チェック
    if (env.ENVIRONMENT === 'preview' && url.pathname.startsWith('/api/')) {
      const token = request.headers.get('X-Preview-Token')
      const expectedToken = env.PREVIEW_TOKEN
      
      if (!token || !expectedToken || token !== expectedToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request)
          }
        })
      }
    }
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
      })
    }
    
    // /api/metadata パスの処理（メタデータを返す）
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const metadata = await metadataObject.text()
          const { cacheControl } = calculateDynamicTTL()
          
          return new Response(metadata, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
      } catch (error) {
        console.error('Metadata read error:', error)
      }
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request),
          ...securityHeaders
        }
      })
    }
    
    // /api/ranking R2から読み込み
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      try {
        // パラメータ取得
        const genre = url.searchParams.get('genre') || 'all'
        const period = url.searchParams.get('period') || '24h'
        const tag = url.searchParams.get('tag')
        
        // R2キー生成
        let r2Key: string
        let cacheKeySuffix: string
        
        if (tag) {
          const encodedTag = encodeURIComponent(tag)
          r2Key = `rankings/${genre}/${period}/tags/${encodedTag}.json`
          cacheKeySuffix = `${genre}/${period}/tags/${encodedTag}`
        } else {
          r2Key = `rankings/${genre}/${period}/all.json`
          cacheKeySuffix = `${genre}/${period}/all`
        }
        
        // Workersキャッシュのキー
        const cacheKey = new Request(`https://r2-cache.nico-rank.com/ranking/${cacheKeySuffix}`, request)
        const cache = caches.default
        
        // キャッシュチェック
        let response = await cache.match(cacheKey)
        if (response) {
          response = new Response(response.body, response)
          response.headers.set('X-Cache-Status', 'HIT')
          
          // If-None-Matchチェック
          const cachedETag = response.headers.get('ETag')
          const ifNoneMatch = request.headers.get('If-None-Match')
          if (cachedETag && ifNoneMatch && isETagMatch(cachedETag, ifNoneMatch)) {
            const { cacheControl, cdnCacheControl } = calculateDynamicTTL()
            return new Response(null, {
              status: 304,
              headers: {
                'ETag': cachedETag,
                'Cache-Control': cacheControl,
                'CDN-Cache-Control': cdnCacheControl,
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          }
          
          return response
        }
        
        // R2から取得
        console.log(`[Worker] Attempting to read from R2: ${r2Key}`)
        const r2Object = await env.R2_BUCKET.get(r2Key)
        
        if (!r2Object) {
          if (tag) {
            // タグデータが存在しない場合
            console.log(`[Worker] Tag data not found for ${r2Key}, returning empty result`)
            const emptyResponse = {
              items: [],
              popularTags: [],
              metadata: {
                version: 1,
                updatedAt: new Date().toISOString(),
                genre,
                period,
                tag
              }
            }
            return new Response(JSON.stringify(emptyResponse), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Data-Source': 'r2-tag-not-found',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          } else {
            // Vercelへフォールバック
            console.log(`R2 miss for ${r2Key}, falling back to Vercel`)
            return proxyToVercel(request, env)
          }
        }
        
        // ETag取得
        const etag = r2Object.httpEtag || `"${r2Object.etag}"`
        
        // If-None-Matchチェック
        const ifNoneMatch = request.headers.get('If-None-Match')
        if (ifNoneMatch && isETagMatch(etag, ifNoneMatch)) {
          const { cacheControl, cdnCacheControl } = calculateDynamicTTL()
          return new Response(null, {
            status: 304,
            headers: {
              'ETag': etag,
              'Cache-Control': cacheControl,
              'CDN-Cache-Control': cdnCacheControl,
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
        
        // R2オブジェクトのメタデータから圧縮情報を取得（元のWorkerと同じロジック）
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        const r2ContentType = r2Object.httpMetadata?.contentType
        console.log(`[Worker] R2 object httpMetadata.contentEncoding: ${r2ContentEncoding}`)
        console.log(`[Worker] R2 object httpMetadata.contentType: ${r2ContentType}`)
        
        // ストリームを分割して最初のチャンクを検査
        const [inspectStream, passthroughStream] = r2Object.body!.tee()
        
        const reader = inspectStream.getReader()
        const { value: firstChunk, done } = await reader.read()
        reader.releaseLock()
        
        // gzipマジックナンバーチェック (0x1f, 0x8b)
        const isGzipped = !done && firstChunk && firstChunk.length >= 2 && firstChunk[0] === 0x1f && firstChunk[1] === 0x8b
        
        // 動的TTLを計算
        const { cacheControl, cdnCacheControl } = calculateDynamicTTL()
        
        // レスポンスヘッダー作成
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Cache-Control', cacheControl)
        headers.set('CDN-Cache-Control', cdnCacheControl)
        headers.set('ETag', etag)
        headers.set('X-Data-Source', 'r2-direct')
        headers.set('X-Cache-Status', 'MISS')
        
        // CORSとセキュリティヘッダーを追加
        Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
          headers.set(key, value)
        })
        Object.entries(securityHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        
        // R2のメタデータにContent-Encodingがある場合は優先
        if (r2ContentEncoding) {
          headers.set('Content-Encoding', r2ContentEncoding)
          headers.set('Vary', 'Accept-Encoding')
          // Cloudflareの変換を防ぐためno-transformを追加
          headers.set('Cache-Control', `${cacheControl}, no-transform`)
        }
        
        if (isGzipped) {
          console.log(`[Worker] Serving pre-compressed gzipped data`)
          
          // 重要: encodeBody: "manual" を使用してCloudflareの自動圧縮を無効化
          headers.set('Content-Encoding', 'gzip')
          headers.set('Vary', 'Accept-Encoding')
          // Cloudflareの変換を防ぐためno-transformを追加
          headers.set('Cache-Control', `${cacheControl}, no-transform`)
          headers.set('CDN-Cache-Control', `${cdnCacheControl}, no-transform`)
          
          response = new Response(passthroughStream, {
            status: 200,
            headers,
            // CloudflareドキュメントのQ: 既に圧縮されたデータを配信するには
            // A: encodeBody: "manual" を設定する必要がある
            encodeBody: "manual"
          } as ResponseInit)
        } else {
          // 非圧縮データの場合はそのまま返す（Cloudflareが自動圧縮する）
          response = new Response(passthroughStream, {
            status: 200,
            headers
          })
        }
        
        // キャッシュに保存
        ctx.waitUntil(cache.put(cacheKey, response.clone()))
        
        return response
        
      } catch (error) {
        console.error('R2 read error:', error)
        // Vercelへフォールバック
        return proxyToVercel(request, env)
      }
    }
    
    // その他のリクエストはVercelへプロキシ
    return proxyToVercel(request, env)
  }
}

// Vercelへのプロキシ関数
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-custom-yjsns-projects.vercel.app'
  
  // ターゲットURLのホスト名取得
  const targetHost = new URL(targetUrl).hostname
  
  // プロキシURL構築
  const proxyUrl = new URL(url.pathname + url.search, targetUrl)
  
  // ヘッダー設定
  const headers = new Headers(request.headers)
  headers.set('Host', targetHost)
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  
  if (env.WORKER_AUTH_KEY) {
    headers.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  
  // Vercelへリクエスト
  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual'
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    // レスポンスヘッダー
    const responseHeaders = new Headers(response.headers)
    
    // セキュリティヘッダー追加
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    // CORSヘッダー追加
    Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return new Response('Gateway Error', { 
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        ...getCorsHeaders(request)
      }
    })
  }
}