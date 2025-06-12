import type { KVNamespace, ExecutionContext, Request as WorkerRequest } from '@cloudflare/workers-types'

interface Env {
  RATE_LIMIT: KVNamespace
  RANKING_DATA: KVNamespace
}

// レート制限の設定
const RATE_LIMITS = {
  general: { requests: 60, window: 60 }, // 60リクエスト/分
  api: { requests: 20, window: 60 },     // 20リクエスト/分
  bot: { requests: 5, window: 60 },      // 5リクエスト/分
  burst: { requests: 10, window: 10 }    // 10リクエスト/10秒（バースト保護）
}

// ボットのUser-Agentパターン
const BOT_PATTERNS = /bot|crawler|spider|scraper|curl|wget|python|java|ruby|go|rust/i

// 静的アセットのパターン
const STATIC_PATTERNS = /\.(js|css|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$/i

// キャッシュ可能なAPIパターン
const CACHEABLE_API_PATTERNS = [
  /^\/api\/ranking/,
  /^\/api\/status/,
  /^\/api\/debug\/item-count/
]

// リクエスト結合用のマップ
const pendingRequests = new Map<string, Promise<Response>>()

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now()
    const url = new URL(request.url)
    
    // メトリクス収集用
    const metrics = {
      cacheHit: false,
      compressed: false,
      responseTime: 0
    }

    try {
      // CORSプリフライトリクエストの処理
      if (request.method === 'OPTIONS') {
        return handleCorsPreFlight()
      }

      // レート制限チェック
      const rateLimitResponse = await checkRateLimit(request, env.RATE_LIMIT)
      if (rateLimitResponse) {
        return rateLimitResponse
      }

      // 静的アセットの処理
      if (STATIC_PATTERNS.test(url.pathname)) {
        return handleStaticAsset(request, ctx, metrics)
      }

      // キャッシュ可能なAPIの処理
      const cacheableApi = CACHEABLE_API_PATTERNS.find(pattern => pattern.test(url.pathname))
      if (cacheableApi) {
        return handleCacheableApi(request, env, ctx, metrics)
      }

      // その他のリクエストをプロキシ
      const response = await proxyRequest(request)
      
      // レスポンス圧縮
      const compressedResponse = await compressResponse(request, response, metrics)
      
      // メトリクスの記録
      metrics.responseTime = Date.now() - startTime
      ctx.waitUntil(logMetrics(url.pathname, metrics))
      
      return addSecurityHeaders(compressedResponse)
      
    } catch (error) {
      console.error('Worker error:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}

// CORSプリフライトリクエストの処理
function handleCorsPreFlight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  })
}

// レート制限チェック
async function checkRateLimit(request: Request, kvNamespace: KVNamespace): Promise<Response | null> {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const userAgent = request.headers.get('User-Agent') || ''
  const url = new URL(request.url)
  
  // ボット判定
  const isBot = BOT_PATTERNS.test(userAgent)
  
  // レート制限の選択
  let rateLimit = RATE_LIMITS.general
  if (isBot) {
    rateLimit = RATE_LIMITS.bot
  } else if (url.pathname.startsWith('/api/')) {
    rateLimit = RATE_LIMITS.api
  }
  
  // バースト保護チェック
  const burstKey = `burst:${clientIp}`
  const burstCount = await kvNamespace.get(burstKey)
  if (burstCount && parseInt(burstCount) >= RATE_LIMITS.burst.requests) {
    return new Response('Too Many Requests - Burst Protection', {
      status: 429,
      headers: {
        'Retry-After': RATE_LIMITS.burst.window.toString(),
        'X-RateLimit-Limit': RATE_LIMITS.burst.requests.toString(),
        'X-RateLimit-Reset': new Date(Date.now() + RATE_LIMITS.burst.window * 1000).toISOString()
      }
    })
  }
  
  // 通常のレート制限チェック
  const key = `rate:${clientIp}:${Math.floor(Date.now() / 1000 / rateLimit.window)}`
  const count = await kvNamespace.get(key)
  const currentCount = count ? parseInt(count) : 0
  
  if (currentCount >= rateLimit.requests) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': rateLimit.window.toString(),
        'X-RateLimit-Limit': rateLimit.requests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + rateLimit.window * 1000).toISOString()
      }
    })
  }
  
  // カウントを更新
  await Promise.all([
    kvNamespace.put(key, (currentCount + 1).toString(), { expirationTtl: rateLimit.window }),
    kvNamespace.put(burstKey, ((parseInt(await kvNamespace.get(burstKey) || '0')) + 1).toString(), { 
      expirationTtl: RATE_LIMITS.burst.window 
    })
  ])
  
  return null
}

// 静的アセットの処理
async function handleStaticAsset(
  request: Request, 
  ctx: ExecutionContext,
  metrics: any
): Promise<Response> {
  const cache = caches.default
  const cacheKey = new Request(request.url, request)
  
  // キャッシュから取得
  let response = await cache.match(cacheKey)
  if (response) {
    metrics.cacheHit = true
    return response
  }
  
  // オリジンから取得
  response = await proxyRequest(request)
  
  // キャッシュに保存
  if (response.status === 200) {
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('CDN-Cache-Control', 'max-age=31536000')
    
    const cachedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
    
    ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()))
    return cachedResponse
  }
  
  return response
}

// キャッシュ可能なAPIの処理
async function handleCacheableApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  metrics: any
): Promise<Response> {
  const url = new URL(request.url)
  const cacheKey = `api:${url.pathname}${url.search}`
  
  // リクエスト結合
  if (pendingRequests.has(cacheKey)) {
    metrics.cacheHit = true
    return pendingRequests.get(cacheKey)!.then(r => r.clone())
  }
  
  // エッジキャッシュをチェック
  const cache = caches.default
  const cachedResponse = await cache.match(request)
  if (cachedResponse) {
    metrics.cacheHit = true
    
    // ETagチェック
    const etag = cachedResponse.headers.get('ETag')
    const ifNoneMatch = request.headers.get('If-None-Match')
    if (etag && ifNoneMatch && etag === ifNoneMatch) {
      return new Response(null, { 
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': cachedResponse.headers.get('Cache-Control') || ''
        }
      })
    }
    
    return cachedResponse
  }
  
  // APIリクエストを実行（結合）
  const responsePromise = (async () => {
    const response = await proxyRequest(request)
    
    if (response.status === 200) {
      const body = await response.text()
      const etag = generateETag(body)
      
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      headers.set('Cloudflare-CDN-Cache-Control', 'max-age=300, stale-while-revalidate=3600')
      headers.set('ETag', etag)
      headers.set('Cache-Tag', `api,${url.pathname.split('/')[2] || 'default'}`)
      
      const cachedResponse = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
      
      // キャッシュに保存
      ctx.waitUntil(cache.put(request, cachedResponse.clone()))
      
      return cachedResponse
    }
    
    return response
  })()
  
  pendingRequests.set(cacheKey, responsePromise)
  
  try {
    const response = await responsePromise
    return response
  } finally {
    pendingRequests.delete(cacheKey)
  }
}

// プロキシリクエスト
async function proxyRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = `https://nico-ranking-custom-yjsns-projects.vercel.app${url.pathname}${url.search}`
  
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow'
  })
  
  // X-Forwarded-* ヘッダーを追加
  proxyRequest.headers.set('X-Forwarded-Host', url.hostname)
  proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))
  
  return fetch(proxyRequest)
}

// レスポンス圧縮
async function compressResponse(
  request: Request, 
  response: Response,
  metrics: any
): Promise<Response> {
  // 圧縮対象外のチェック
  if (response.status !== 200 || 
      response.headers.get('Content-Encoding') ||
      (parseInt(response.headers.get('Content-Length') || '0') < 1024)) {
    return response
  }
  
  const acceptEncoding = request.headers.get('Accept-Encoding') || ''
  const contentType = response.headers.get('Content-Type') || ''
  
  // テキストベースのコンテンツのみ圧縮
  if (!contentType.includes('text/') && 
      !contentType.includes('application/json') &&
      !contentType.includes('application/javascript')) {
    return response
  }
  
  const body = await response.arrayBuffer()
  const headers = new Headers(response.headers)
  
  // Cloudflare Workersの圧縮APIを使用
  if (acceptEncoding.includes('gzip') || acceptEncoding.includes('br')) {
    // Cloudflare Workersは自動的に圧縮を処理するため、
    // ここでは圧縮フラグとVaryヘッダーのみ設定
    headers.set('Vary', 'Accept-Encoding')
    metrics.compressed = true
  }
  
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}

// セキュリティヘッダーの追加
function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  
  // 既存のセキュリティヘッダー
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-XSS-Protection', '1; mode=block')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  // CSPヘッダー
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.nicovideo.jp; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self'; " +
      "connect-src 'self' https://www.nicovideo.jp https://api.nicovideo.jp; " +
      "frame-ancestors 'none';"
    )
  }
  
  // HSTSヘッダー
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

// ETag生成
function generateETag(content: string): string {
  // 簡易的なハッシュ生成
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `"${Math.abs(hash).toString(16)}"`
}

// メトリクスのログ記録
async function logMetrics(path: string, metrics: any): Promise<void> {
  // Cloudflare Analyticsに送信（実装は環境に依存）
  console.log('Metrics:', {
    path,
    cacheHit: metrics.cacheHit,
    compressed: metrics.compressed,
    responseTime: metrics.responseTime
  })
}