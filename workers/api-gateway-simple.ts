/**
 * Cloudflare Workers API Gateway - Simplified Version
 * デバッグ用のシンプルな実装
 */

// Rate limiting imports removed
export interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

export interface Env {
  // RATE_LIMIT removed - no longer needed
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
  USE_PREVIEW?: string
  PREVIEW_URL?: string
  VERCEL_PROTECTION_BYPASS_SECRET?: string
  WORKER_AUTH_KEY?: string
  // PREVIEW_PROTECTION_KEY?: string  // 無効化
}

// Rate limiting completely removed to avoid exceeding KV write limits

// Helper function to apply security headers to any response
function applySecurityHeaders(response: Response, url: URL): Response {
  const newHeaders = new Headers(response.headers)
  
  // Security headers
  newHeaders.set('X-Content-Type-Options', 'nosniff')
  newHeaders.set('X-Frame-Options', 'DENY')
  newHeaders.set('X-XSS-Protection', '1; mode=block')
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin')
  newHeaders.set('X-DNS-Prefetch-Control', 'on')
  
  // Content Security Policy (CSP)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com https://vercel.live",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
    "media-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ]
  newHeaders.set('Content-Security-Policy', cspDirectives.join('; '))
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      
      // Rate limiting removed - rely on Cloudflare's built-in DDoS protection
      
      // デバッグ情報
      if (url.pathname === '/debug') {
        const targetUrl = env.USE_PREVIEW === 'true' && env.PREVIEW_URL 
          ? env.PREVIEW_URL 
          : env.NEXT_APP_URL
          
        return new Response(JSON.stringify({
          env: {
            NEXT_APP_URL: env.NEXT_APP_URL || 'NOT SET',
            USE_PREVIEW: env.USE_PREVIEW || 'false',
            PREVIEW_URL: env.PREVIEW_URL || 'NOT SET',
            ACTIVE_URL: targetUrl,
            // hasRateLimit: removed,
            hasRankingData: !!env.RANKING_DATA,
            hasWorkerAuthKey: !!env.WORKER_AUTH_KEY,
            hasVercelBypassSecret: !!env.VERCEL_PROTECTION_BYPASS_SECRET
            // hasPreviewProtectionKey: !!env.PREVIEW_PROTECTION_KEY  // 無効化
          },
          request: {
            url: request.url,
            method: request.method,
            headers: {} // Headers simplified for debugging
          },
          authenticationStatus: {
            workerAuthConfigured: !!env.WORKER_AUTH_KEY,
            vercelBypassConfigured: !!env.VERCEL_PROTECTION_BYPASS_SECRET,
            // previewProtectionConfigured: !!env.PREVIEW_PROTECTION_KEY,  // 無効化
            isPreviewMode: env.USE_PREVIEW === 'true'
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // プレビュー環境または本番環境を選択
      const baseUrl = env.USE_PREVIEW === 'true' && env.PREVIEW_URL 
        ? env.PREVIEW_URL 
        : env.NEXT_APP_URL
        
      if (!baseUrl) {
        return new Response('Target URL not configured', { status: 500 })
      }
      
      const targetUrl = `${baseUrl}${url.pathname}${url.search}`
      
      // Cloudflare Workers Cache APIを使用
      const cache = (caches as any).default
      const cacheKey = new Request(targetUrl, request)
      
      // Disable Worker cache for large responses
      // Use Cloudflare's edge cache instead
      let response: Response | undefined
      
      // 認証ヘッダーを追加してプロキシ
      const proxyHeaders = new Headers(request.headers)
      
      // 重要: Vercel middleware bypass用の認証ヘッダー
      if (env.WORKER_AUTH_KEY) {
        proxyHeaders.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
      }
      
      // Preview Protection用のヘッダーを追加（プレビュー環境の場合）
      // 無効化 - Vercelのスタンダードプロテクションに依存
      // if (env.USE_PREVIEW === 'true' && env.PREVIEW_PROTECTION_KEY) {
      //   proxyHeaders.set('X-Preview-Protection', env.PREVIEW_PROTECTION_KEY)
      // }
      
      // Vercel Protection Bypassヘッダーを追加（標準のVercel認証）
      if (env.VERCEL_PROTECTION_BYPASS_SECRET) {
        proxyHeaders.set('x-vercel-protection-bypass', env.VERCEL_PROTECTION_BYPASS_SECRET)
        proxyHeaders.set('x-vercel-set-bypass-cookie', 'true')
      }
      
      // Add Host header to prevent Vercel from redirecting
      proxyHeaders.set('Host', new URL(targetUrl).host)
      proxyHeaders.set('X-Forwarded-Host', 'nico-rank.com')
      proxyHeaders.set('X-Forwarded-Proto', 'https')
      
      // Stream response to avoid memory issues with large responses
      response = await fetch(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        // Important: don't buffer the entire response
        cf: {
          cacheTtl: 0,
          cacheEverything: false
        }
      })
      
      // Disable caching for large responses to avoid memory issues
      // Large ranking responses (16MB+) can exceed Worker memory limits
      // Let Cloudflare's edge cache handle it instead
      
      // Apply security headers to all responses
      const secureResponse = applySecurityHeaders(response, url)
      
      // Add cache status header for cacheable endpoints
      if (url.pathname.startsWith('/api/edge/ranking') || url.pathname.startsWith('/api/edge/video-stats')) {
        secureResponse.headers.set('X-CF-Cache', 'MISS')
      }
      
      return secureResponse
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
}