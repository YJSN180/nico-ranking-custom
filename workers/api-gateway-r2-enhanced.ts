/**
 * Cloudflare Worker - 強化版API Gateway with R2 Integration
 * 動的TTLとETag対応
 */

import { calculateDynamicTTL, generateETag, isETagMatch } from '../lib/cache-utils'

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
}

// セキュリティヘッダー
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

// CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS 
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      })
    }
    
    // /api/metadata 
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const metadata = await metadataObject.text()
          
          // 動的TTLを計算
          const { cacheControl } = calculateDynamicTTL()
          
          return new Response(metadata, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
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
    
    // /api/ranking R2
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
        
        // キャッシュキー
        const cacheKey = new Request(`https://r2-cache.nico-rank.com/ranking/${cacheKeySuffix}`, request)
        const cache = (caches as any).default
        
        // キャッシュチェック
        let response = await cache.match(cacheKey)
        if (response) {
          response = new Response(response.body, response)
          response.headers.set('X-Cache-Status', 'HIT')
          
          // If-None-Matchチェック
          const cachedETag = response.headers.get('ETag')
          const ifNoneMatch = request.headers.get('If-None-Match')
          if (cachedETag && ifNoneMatch && isETagMatch(cachedETag, ifNoneMatch)) {
            return new Response(null, {
              status: 304,
              headers: {
                'ETag': cachedETag,
                ...corsHeaders,
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
                ...corsHeaders,
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
              ...corsHeaders,
              ...securityHeaders
            }
          })
        }
        
        // 圧縮データの処理
        let responseBody: ReadableStream<Uint8Array> | string
        let contentEncoding: string | undefined
        
        if (r2Object.httpMetadata?.contentEncoding === 'gzip') {
          // 圧縮されたまま返す
          responseBody = r2Object.body!
          contentEncoding = 'gzip'
        } else {
          // 非圧縮データ
          responseBody = await r2Object.text()
        }
        
        // 動的TTLを計算
        const { cacheControl, cdnCacheControl } = calculateDynamicTTL()
        
        // レスポンス作成
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          'Cache-Control': cacheControl,
          'CDN-Cache-Control': cdnCacheControl,
          'ETag': etag,
          'X-Data-Source': 'r2-direct',
          'X-Cache-Status': 'MISS',
          ...corsHeaders,
          ...securityHeaders
        }
        
        if (contentEncoding) {
          headers['Content-Encoding'] = contentEncoding
        }
        
        response = new Response(responseBody, {
          status: 200,
          headers
        })
        
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