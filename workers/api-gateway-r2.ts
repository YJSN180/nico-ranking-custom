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
    
    // デバッグエンドポイント
    if (url.pathname === '/api/debug') {
      return new Response(JSON.stringify({
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries()),
        worker: 'api-gateway-r2',
        version: '2025-06-25-debug-v2'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }
    
    // R2メタデータテストエンドポイント
    if (url.pathname === '/api/test-r2-metadata') {
      try {
        const testKey = 'rankings/all/24h/all.json'
        const testObject = await env.R2_BUCKET.get(testKey)
        
        if (testObject) {
          // 最初の10バイトを読み取ってgzip確認
          const reader = testObject.body.getReader()
          const { value: firstChunk } = await reader.read()
          reader.releaseLock()
          
          const isGzipped = firstChunk && firstChunk.length >= 2 && 
                           firstChunk[0] === 0x1f && firstChunk[1] === 0x8b
          
          return new Response(JSON.stringify({
            key: testKey,
            exists: true,
            size: testObject.size,
            httpMetadata: testObject.httpMetadata || {},
            customMetadata: testObject.customMetadata || {},
            firstBytes: firstChunk ? Array.from(firstChunk.slice(0, 10)) : [],
            isGzipped: isGzipped
          }, null, 2), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          })
        } else {
          return new Response(JSON.stringify({
            key: testKey,
            exists: false
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          })
        }
      } catch (error) {
        return new Response(JSON.stringify({
          error: error.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        })
      }
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
        
        // R2オブジェクトのデバッグ情報
        if (r2Object) {
          console.log(`[Worker] R2 object found, size: ${r2Object.size}`)
          console.log(`[Worker] R2 httpMetadata:`, JSON.stringify(r2Object.httpMetadata || {}))
          console.log(`[Worker] R2 customMetadata:`, JSON.stringify(r2Object.customMetadata || {}))
        }
        
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
        // Stream処理で効率的に実装（専門家の推奨案）
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        
        // ゲームジャンルの場合は一時的にキャッシュを無効化
        if (genre === 'game') {
          headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
          headers.set('Pragma', 'no-cache')
          headers.set('Expires', '0')
          headers.set('X-Debug-Note', 'Game genre cache disabled temporarily')
        } else {
          headers.set('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400')
        }
        
        headers.set('CDN-Cache-Control', 'public, max-age=3600')
        headers.set('X-Data-Source', 'r2-direct')
        headers.set('X-Cache-Status', 'MISS')
        
        // CORSとセキュリティヘッダーを追加
        Object.entries(corsHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        Object.entries(securityHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        const r2ContentType = r2Object.httpMetadata?.contentType
        console.log(`[Worker] R2 object httpMetadata.contentEncoding: ${r2ContentEncoding}`)
        console.log(`[Worker] R2 object httpMetadata.contentType: ${r2ContentType}`)
        
        // Content-Encodingヘッダーは設定しない
        // Cloudflareが自動的に圧縮を処理するため、手動での設定は避ける
        // これにより、ヘッダーとボディの不一致を防ぐ
        
        // ストリームを分割して最初のチャンクを検査
        const [inspectStream, passthroughStream] = r2Object.body.tee()
        
        const reader = inspectStream.getReader()
        const { value: firstChunk, done } = await reader.read()
        reader.releaseLock()
        
        // gzipマジックナンバーチェック (0x1f, 0x8b)
        const isGzipped = !done && firstChunk && firstChunk.length >= 2 && firstChunk[0] === 0x1f && firstChunk[1] === 0x8b
        
        if (isGzipped) {
          console.log(`[Worker] Data is gzipped, decompressing before sending`)
          
          // gzip圧縮されたデータを解凍してから送信
          // これにより、Content-Encodingヘッダーとデータの不一致を防ぐ
          try {
            // ストリーム全体を読み込んで解凍
            const compressedData = await new Response(passthroughStream).arrayBuffer()
            const decompressedData = await new Response(
              new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
            ).arrayBuffer()
            
            // 解凍したデータを返す（Cloudflareが必要に応じて再圧縮）
            response = new Response(decompressedData, {
              status: 200,
              headers
            })
          } catch (decompressError) {
            console.error('[Worker] Failed to decompress gzipped data:', decompressError)
            // 解凍に失敗した場合は、元のストリームをそのまま返す
            response = new Response(passthroughStream, {
              status: 200,
              headers
            })
          }
        } else {
          // 非圧縮データの場合はそのまま返す（Cloudflareが自動圧縮する）
          response = new Response(passthroughStream, {
            status: 200,
            headers
          })
        }
        
        // キャッシュに保存（一時的に無効化してデバッグ）
        // ctx.waitUntil(cache.put(cacheKey, response.clone()))
        
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