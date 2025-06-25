/**
 * Cloudflare Worker - API Gateway with R2 Integration
 * R2から直接ランキングデータを配信
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

// CORSヘッダー定義
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      })
    }
    
    // /api/metadata パスの処理（メタデータを返す）
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const metadata = await metadataObject.text()
          return new Response(metadata, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
              ...corsHeaders,
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
          ...corsHeaders,
          ...securityHeaders
        }
      })
    }
    
    // /api/ranking パスの処理（R2から直接配信）
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      try {
        // クエリパラメータからジャンルと期間を取得
        const genre = url.searchParams.get('genre') || 'all'
        const period = url.searchParams.get('period') || '24h'
        const tag = url.searchParams.get('tag')
        
        // R2のキーを構築
        let r2Key: string
        let cacheKeySuffix: string
        
        if (tag) {
          // タグ別ランキング
          const encodedTag = encodeURIComponent(tag)
          r2Key = `rankings/${genre}/${period}/tags/${encodedTag}.json`
          cacheKeySuffix = `${genre}/${period}/tags/${encodedTag}`
        } else {
          // ジャンル別「すべて」ランキング
          r2Key = `rankings/${genre}/${period}/all.json`
          cacheKeySuffix = `${genre}/${period}/all`
        }
        
        // キャッシュキー（実際のURLベースで作成）
        const cacheUrl = new URL(request.url)
        cacheUrl.pathname = `/api/ranking/${cacheKeySuffix}`
        const cacheKey = new Request(cacheUrl.toString(), {
          method: 'GET',
          headers: {
            'CF-Cache-Key': cacheKeySuffix
          }
        })
        const cache = caches.default
        
        // キャッシュチェック
        let response = await cache.match(cacheKey)
        if (response) {
          response = new Response(response.body, response)
          response.headers.set('X-Cache-Status', 'HIT')
          return response
        }
        
        // R2から読み取り
        console.log(`[Worker] Attempting to read from R2: ${r2Key}`)
        const r2Object = await env.R2_BUCKET.get(r2Key)
        
        if (!r2Object) {
          // R2にデータがない場合
          if (tag) {
            // タグ別データが存在しない場合は空の結果を返す
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
                ...corsHeaders,
                ...securityHeaders
              }
            })
          } else {
            // 通常のランキングデータが存在しない場合はVercelにフォールバック
            console.log(`R2 miss for ${r2Key}, falling back to Vercel`)
            return proxyToVercel(request, env)
          }
        }
        
        // R2から取得したデータを返す
        // R2オブジェクトがgzip圧縮されているかチェック
        const contentEncoding = r2Object.httpMetadata?.contentEncoding
        const isPreCompressed = contentEncoding === 'gzip'
        
        // クライアントがgzipをサポートしているかチェック
        const acceptEncoding = request.headers.get('Accept-Encoding') || ''
        const supportsGzip = acceptEncoding.includes('gzip')
        
        console.log(`[Worker] R2 data found for ${r2Key}, pre-compressed: ${isPreCompressed}, client supports gzip: ${supportsGzip}`)
        
        const responseHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
          'CDN-Cache-Control': 'public, max-age=3600',
          'X-Data-Source': 'r2-direct',
          'X-Cache-Status': 'MISS',
          'X-Pre-Compressed': isPreCompressed ? 'true' : 'false',
          ...corsHeaders,
          ...securityHeaders
        }
        
        if (isPreCompressed && supportsGzip) {
          // R2データが既に圧縮済みで、クライアントもgzipをサポートしている場合
          // そのまま圧縮データを返す
          const compressedData = await r2Object.arrayBuffer()
          responseHeaders['Content-Encoding'] = 'gzip'
          responseHeaders['Vary'] = 'Accept-Encoding'
          responseHeaders['X-Original-Size'] = r2Object.size.toString()
          console.log(`[Worker] Serving pre-compressed data: ${compressedData.byteLength} bytes`)
          response = new Response(compressedData, {
            status: 200,
            headers: responseHeaders
          })
        } else if (isPreCompressed && !supportsGzip) {
          // R2データが圧縮済みだが、クライアントがgzipをサポートしていない場合
          // 解凍して返す（このケースは稀だが対応）
          const compressedData = await r2Object.arrayBuffer()
          console.log(`[Worker] Client doesn't support gzip, decompressing...`)
          
          // DecompressionStreamを使用して解凍
          const decompressionStream = new DecompressionStream('gzip')
          const writer = decompressionStream.writable.getWriter()
          const reader = decompressionStream.readable.getReader()
          
          writer.write(new Uint8Array(compressedData))
          writer.close()
          
          const chunks: Uint8Array[] = []
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
          }
          
          const decompressedData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
          let offset = 0
          for (const chunk of chunks) {
            decompressedData.set(chunk, offset)
            offset += chunk.length
          }
          
          const decompressedString = new TextDecoder().decode(decompressedData)
          
          response = new Response(decompressedString, {
            status: 200,
            headers: responseHeaders
          })
        } else {
          // R2データが非圧縮の場合（既存のデータとの互換性のため）
          const data = await r2Object.text()
          responseHeaders['X-Original-Size'] = data.length.toString()
          console.log(`[Worker] Serving uncompressed data: ${data.length} characters`)
          response = new Response(data, {
            status: 200,
            headers: responseHeaders
          })
        }
        
        // キャッシュに保存
        ctx.waitUntil(cache.put(cacheKey, response.clone()))
        
        return response
        
      } catch (error) {
        console.error('R2 read error:', error)
        // エラー時はVercelにフォールバック
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
  
  // URLからホスト名を抽出
  const targetHost = new URL(targetUrl).hostname
  
  // プロキシ用のURL構築
  const proxyUrl = new URL(url.pathname + url.search, targetUrl)
  
  // リクエストヘッダーの準備
  const headers = new Headers(request.headers)
  headers.set('Host', targetHost)
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  
  // 認証キーを追加
  if (env.WORKER_AUTH_KEY) {
    headers.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  
  // Vercelへのリクエスト
  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual'
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    // レスポンスヘッダーの処理
    const responseHeaders = new Headers(response.headers)
    
    // セキュリティヘッダーを追加
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
    // CORSヘッダーを追加
    Object.entries(corsHeaders).forEach(([key, value]) => {
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
        ...corsHeaders
      }
    })
  }
}