/**
 * Blue Worker - Original API Gateway Implementation  
 * R2から直接ランキングデータを配信 (Blue/Green用)
 * Static TTL version (旧バージョン互換性維持)
 */

/// <reference types="@cloudflare/workers-types" />

import { decodeRankingData } from './utils/html-decode'

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY?: string
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  MAINTENANCE_FLAGS?: KVNamespace
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
      })
    }
    
    // /api/debug パスの処理（デバッグ情報を返す）
    if (url.pathname === '/api/debug') {
      return new Response(JSON.stringify({
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers),
        worker: 'api-gateway-blue-20250705',
        version: 'blue-20250705-r2',
        features: ['r2-storage', 'html-decode', 'blue-20250705']
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request),
          ...securityHeaders,
          'X-Worker-Version': 'blue-20250705-r2'
        }
      })
    }

    // /api/metadata パスの処理
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          // gzip圧縮チェック
          const contentEncoding = metadataObject.httpMetadata?.contentEncoding
          let metadataText: string
          
          if (contentEncoding === 'gzip') {
            console.log('[Blue Worker 20250705] Metadata is gzipped, decompressing...')
            try {
              const compressedData = await metadataObject.arrayBuffer()
              metadataText = await new Response(
                new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
              ).text()
            } catch (decompressError) {
              console.error('[Blue Worker 20250705] Failed to decompress metadata:', decompressError)
              metadataText = await metadataObject.text()
            }
          } else {
            metadataText = await metadataObject.text()
          }
          
          return new Response(metadataText, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
              'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
              'X-Worker-Version': 'blue-20250705',
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
    
    // /api/ranking パスの処理
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      const genre = url.searchParams.get('genre') || 'all'
      const period = url.searchParams.get('period') || '24h'
      const tag = url.searchParams.get('tag') || ''
      
      console.log(`[Blue Worker] Request received - Genre: ${genre}, Period: ${period}, Tag: ${tag}`)
      
      try {
        // R2からデータを取得
        const r2Key = tag 
          ? `rankings/${genre}/${period}/tags/${encodeURIComponent(tag)}.json`
          : `rankings/${genre}/${period}/all.json`
        
        console.log(`[Blue Worker] Fetching from R2: ${r2Key}`)
        const r2Object = await env.R2_BUCKET.get(r2Key)
        
        if (!r2Object) {
          if (tag) {
            // タグ別データが存在しない場合は空の結果を返す
            console.log(`[Blue Worker] Tag data not found for ${r2Key}, returning empty result`)
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
                'Cache-Control': 'public, max-age=300',
                'X-Data-Source': 'r2-tag-not-found',
                'X-Worker-Version': 'blue-20250705',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          } else {
            // 通常のランキングデータが存在しない場合は404を返す
            console.log(`[Blue Worker] R2 miss for ${r2Key}, returning 404`)
            return new Response(JSON.stringify({
              error: 'Ranking data not found',
              message: `No data available for ${genre}/${period}`
            }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Data-Source': 'r2-not-found',
                'X-Worker-Version': 'blue-20250705',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          }
        }
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        
        // HTMLエンティティのデコード処理
        const [passthroughStream, workStream] = r2Object.body.tee()
        
        if (r2ContentEncoding === 'gzip') {
          // gzip圧縮されたデータの場合
          console.log(`[Blue Worker] Data is gzipped, decompressing and decoding`)
          
          try {
            const compressedData = await new Response(passthroughStream).arrayBuffer()
            const decompressedData = await new Response(
              new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
            ).text()
            
            // JSONをパースしてHTMLエンティティをデコード
            try {
              const jsonData = JSON.parse(decompressedData)
              const decodedData = decodeRankingData(jsonData)
              
              return new Response(JSON.stringify(decodedData), {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'public, max-age=300',
                  'X-Data-Source': 'r2-blue-worker',
                  'X-Worker-Version': 'blue-20250705',
                  'X-Original-Encoding': 'gzip',
                  ...getCorsHeaders(request),
                  ...securityHeaders
                }
              })
            } catch (parseError) {
              console.error('[Blue Worker] Failed to parse or decode JSON:', parseError)
              return new Response(decompressedData, {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'public, max-age=300',
                  'X-Data-Source': 'r2-blue-worker',
                  'X-Worker-Version': 'blue-20250705',
                  ...getCorsHeaders(request),
                  ...securityHeaders
                }
              })
            }
          } catch (decompressError) {
            console.error('[Blue Worker] Failed to decompress gzipped data:', decompressError)
            return new Response(workStream, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
                'X-Data-Source': 'r2-blue-worker',
                'X-Worker-Version': 'blue-20250705',
                ...getCorsHeaders(request),
                ...securityHeaders
              },
              encodeBody: "manual"
            } as ResponseInit)
          }
        } else {
          // 非圧縮データの場合
          console.log(`[Blue Worker] Data is not gzipped, decoding HTML entities`)
          
          try {
            const textData = await new Response(passthroughStream).text()
            const jsonData = JSON.parse(textData)
            const decodedData = decodeRankingData(jsonData)
            
            return new Response(JSON.stringify(decodedData), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
                'X-Data-Source': 'r2-blue-worker',
                'X-Worker-Version': 'blue-20250705',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          } catch (error) {
            console.error('[Blue Worker] Failed to parse or decode JSON:', error)
            return new Response(workStream, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
                'X-Data-Source': 'r2-blue-worker',
                'X-Worker-Version': 'blue-20250705',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          }
        }

      } catch (error) {
        console.error('[Blue Worker] Error fetching from R2:', error)
        return new Response(JSON.stringify({
          error: 'Internal server error',
          message: 'Failed to fetch ranking data'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'X-Worker-Version': 'blue-20250705',
            ...getCorsHeaders(request),
            ...securityHeaders
          }
        })
      }
    }
    
    // 静的ファイルのリクエストをチェック（先にR2から試す）
    const pathname = url.pathname
    const staticFiles = ['/icon.png', '/icon-192.png', '/icon-512.png', '/og-image.png', '/manifest.json', '/robots.txt'];
    const isStaticFile = staticFiles.includes(pathname) || pathname.startsWith('/fonts/') || /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|eot)$/i.test(pathname)
    
    if (isStaticFile && env.R2_BUCKET) {
      try {
        const r2Key = pathname.startsWith('/') ? `static${pathname}` : `static/${pathname}`
        console.log(`[Blue Static File] Trying to fetch from R2: ${r2Key}`)
        const object = await env.R2_BUCKET.get(r2Key)
        
        if (object) {
          const extension = pathname.split('.').pop()?.toLowerCase() || ''
          const contentType = getContentType(extension)
          
          const headers = new Headers()
          headers.set('Content-Type', contentType)
          headers.set('Cache-Control', 'public, max-age=31536000, immutable')
          headers.set('ETag', object.etag)
          headers.set('X-Data-Source', 'r2-static')
          headers.set('X-Worker-Version', 'blue-20250705')
          
          Object.entries(securityHeaders).forEach(([key, value]) => {
            headers.set(key, value)
          })
          
          return new Response(object.body, {
            status: 200,
            headers
          })
        }
      } catch (error) {
        console.error(`[Blue Static File] Error fetching from R2:`, error)
      }
      
      console.log(`[Blue Static File] Not found in R2, proxying to Vercel: ${pathname}`)
      return proxyToVercel(request, env)
    }
    
    // その他のリクエストはVercelにプロキシ
    return proxyToVercel(request, env)
  }
}

// Content-Type推測用のヘルパー関数
function getContentType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'css': 'text/css',
    'js': 'application/javascript',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'eot': 'application/vnd.ms-fontobject'
  }
  return mimeTypes[extension] || 'application/octet-stream'
}

// Vercelへのプロキシ関数（フォールバック用）
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-custom-yjsns-projects.vercel.app'
  
  const targetHost = new URL(targetUrl).hostname
  const proxyUrl = new URL(url.pathname + url.search, targetUrl)
  
  const headers = new Headers(request.headers)
  headers.set('Host', targetHost)
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  
  if (env.WORKER_AUTH_KEY) {
    headers.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  
  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual'
  })
  
  try {
    const response = await fetch(proxyRequest)
    
    // 307リダイレクトの処理（無限ループ防止）
    if (response.status === 307 || response.status === 301 || response.status === 302 || response.status === 303 || response.status === 308) {
      const location = response.headers.get('Location')
      console.warn(`[Blue Worker] Redirect detected: ${response.status} to ${location}`)
      
      // リダイレクト先がnico-rank.comの場合は無視して200を返す
      if (location && (location.includes('nico-rank.com') || location.includes('nico-ranking-custom'))) {
        console.warn('[Blue Worker] Preventing redirect loop, returning 200 instead')
        // リダイレクトを無視してVercelからコンテンツを取得
        const finalResponse = await fetch(location || proxyUrl.toString(), {
          method: 'GET',
          headers: headers,
          redirect: 'follow'
        })
        
        const finalHeaders = new Headers(finalResponse.headers)
        Object.entries(securityHeaders).forEach(([key, value]) => {
          finalHeaders.set(key, value)
        })
        Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
          finalHeaders.set(key, value)
        })
        
        return new Response(finalResponse.body, {
          status: 200,
          statusText: 'OK',
          headers: finalHeaders
        })
      }
    }
    
    // 通常のレスポンス処理
    const responseHeaders = new Headers(response.headers)
    
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value)
    })
    
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