/**
 * Cloudflare Worker - API Gateway with R2 Integration, Dynamic TTL, ETag, and KV-based Maintenance Mode
 * 動的TTL、ETag対応、KVベースのメンテナンスモード統合版
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  MAINTENANCE_FLAGS: KVNamespace
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY?: string
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
 * 最適化された動的TTLを計算
 * 改良点：固定Browser TTL、適切なstale-while-revalidate、パフォーマンス向上
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
  
  // 最適化されたTTL値
  // Browser: 固定5分（セッション内の重複リクエスト防止）
  // CDN: 固定15分（安定したキャッシュヒット率）
  // Worker: 動的（最大20分）
  const browserTTL = 300  // 5分固定
  const cdnTTL = 900     // 15分固定
  const workerTTL = Math.min(secondsUntilUpdate, 1200) // 最大20分
  
  // Cache-Controlヘッダーを生成
  // stale-while-revalidate: 20分（鮮度要件の上限）
  // stale-if-error: 24時間（障害時の可用性確保）
  const cacheControl = `public, max-age=${browserTTL}, s-maxage=${cdnTTL}, stale-while-revalidate=1200, stale-if-error=86400`
  const cdnCacheControl = `public, max-age=${cdnTTL}`
  
  return {
    cacheControl,
    cdnCacheControl,
    workerTTL,
    secondsUntilUpdate
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

// メンテナンス画面のHTML生成（削除：Smart Routerでのみ使用）
// この関数は削除され、メンテナンスモードの処理はSmart Routerに統一

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // メンテナンスモードチェックは削除
    // Smart Routerで既にチェック済みのため、ここでの重複チェックは不要
    // Green WorkerはSmart Router経由でのみアクセスされることを前提とする
    
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
    
    // /api/debug エンドポイント
    if (url.pathname === '/api/debug') {
      const debugInfo = {
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries()),
        worker: 'api-gateway-r2-with-dynamic-ttl-and-kv-maintenance',
        version: '2025-06-26-dynamic-ttl-kv-maintenance',
        note: 'Maintenance mode checks removed - handled by Smart Router'
      };
      
      return new Response(JSON.stringify(debugInfo, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      })
    }
    
    // /api/ranking パスの処理
    if (url.pathname === '/api/ranking' && env.R2_BUCKET) {
      const genre = url.searchParams.get('genre') || 'all'
      const period = url.searchParams.get('period') || '24h'
      const tag = url.searchParams.get('tag') || ''
      const page = parseInt(url.searchParams.get('page') || '1', 10)
      const limit = parseInt(url.searchParams.get('limit') || '100', 10)
      
      console.log(`[Worker] Request received - Genre: ${genre}, Period: ${period}, Tag: ${tag}, Page: ${page}`)
      
      let response: Response
      
      try {
        // R2からデータを取得
        const r2Key = tag 
          ? `rankings/${genre}/${period}/tags/${encodeURIComponent(tag)}.json`
          : `rankings/${genre}/${period}/all.json`
        
        console.log(`[Worker] Fetching from R2: ${r2Key}`)
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
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          } else {
            // 通常のランキングデータが存在しない場合は404を返す
            console.log(`R2 miss for ${r2Key}, returning 404`)
            return new Response(JSON.stringify({
              error: 'Ranking data not found',
              message: `No data available for ${genre}/${period}`
            }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Data-Source': 'r2-not-found',
                ...getCorsHeaders(request),
                ...securityHeaders
              }
            })
          }
        }
        
        // ETag取得
        const etag = r2Object.httpEtag || `"${r2Object.etag}"`
        
        // If-None-Matchチェック
        const ifNoneMatch = request.headers.get('If-None-Match')
        if (ifNoneMatch && isETagMatch(etag, ifNoneMatch)) {
          const { cacheControl, cdnCacheControl, workerTTL, secondsUntilUpdate } = calculateDynamicTTL()
          return new Response(null, {
            status: 304,
            headers: {
              'ETag': etag,
              'Cache-Control': cacheControl,
              'CDN-Cache-Control': cdnCacheControl,
              'CF-Cache-Status': 'REVALIDATED',
              'Server-Timing': `cfCache;desc="REVALIDATED", workerTTL;dur=${workerTTL}, nextUpdate;dur=${secondsUntilUpdate}`,
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
        
        // 動的TTLを計算
        const { cacheControl, cdnCacheControl, workerTTL, secondsUntilUpdate } = calculateDynamicTTL()
        
        // R2から取得したデータを返す
        const headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Cache-Control', cacheControl)
        headers.set('CDN-Cache-Control', cdnCacheControl)
        headers.set('ETag', etag)
        headers.set('X-Data-Source', 'r2-direct')
        headers.set('X-Cache-Status', 'MISS')
        headers.set('CF-Cache-Status', 'MISS')
        headers.set('Server-Timing', `cfCache;desc="MISS", workerTTL;dur=${workerTTL}, nextUpdate;dur=${secondsUntilUpdate}`)
        
        // CORSとセキュリティヘッダーを追加
        Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
          headers.set(key, value)
        })
        Object.entries(securityHeaders).forEach(([key, value]) => {
          headers.set(key, value)
        })
        
        // R2オブジェクトのメタデータから圧縮情報を取得
        const r2ContentEncoding = r2Object.httpMetadata?.contentEncoding
        if (r2ContentEncoding) {
          headers.set('Content-Encoding', r2ContentEncoding)
          headers.set('Vary', 'Accept-Encoding')
          // Cloudflareの変換を防ぐためno-transformを追加
          headers.set('Cache-Control', `${cacheControl}, no-transform`)
        }
        
        response = new Response(r2Object.body, {
          status: 200,
          headers,
          encodeBody: r2ContentEncoding ? "manual" : "auto"
        } as ResponseInit)
        
        console.log('[Worker] Successfully served from R2')
        
      } catch (error) {
        console.error('[Worker] Error fetching from R2:', error)
        return new Response(JSON.stringify({
          error: 'Internal server error',
          message: 'Failed to fetch ranking data'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...getCorsHeaders(request),
            ...securityHeaders
          }
        })
      }
      
      // レスポンスにキャッシュ情報を追加
      response.headers.set('X-Cache-Status', 'MISS')
      response.headers.set('X-Data-Source', 'r2-direct')
      
      return response
    }
    
    // 静的ファイルのリクエストをチェック（先にR2から試す）
    const pathname = url.pathname
    const staticFiles = ['/icon.png', '/icon-192.png', '/icon-512.png', '/og-image.png', '/manifest.json', '/robots.txt'];
    const isStaticFile = staticFiles.includes(pathname) || pathname.startsWith('/fonts/') || /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|eot)$/i.test(pathname)
    
    if (isStaticFile) {
      // まずR2から静的ファイルを探す
      try {
        // staticプレフィックスを追加してR2キーを構築
        const r2Key = pathname.startsWith('/') ? `static${pathname}` : `static/${pathname}`
        console.log(`[Static File] Trying to fetch from R2: ${r2Key}`)
        const object = await env.R2_BUCKET.get(r2Key)
        
        if (object) {
          // R2から見つかった場合
          const extension = pathname.split('.').pop()?.toLowerCase() || ''
          const contentType = getContentType(extension)
          
          const headers = new Headers()
          headers.set('Content-Type', contentType)
          headers.set('Cache-Control', 'public, max-age=31536000, immutable')
          headers.set('ETag', object.etag)
          headers.set('X-Data-Source', 'r2-static')
          
          // セキュリティヘッダーを追加
          Object.entries(securityHeaders).forEach(([key, value]) => {
            headers.set(key, value)
          })
          
          return new Response(object.body, {
            status: 200,
            headers
          })
        }
      } catch (error) {
        console.error(`[Static File] Error fetching from R2:`, error)
      }
      
      // R2に見つからない場合はVercelにフォールバック
      console.log(`[Static File] Not found in R2, proxying to Vercel: ${pathname}`)
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

