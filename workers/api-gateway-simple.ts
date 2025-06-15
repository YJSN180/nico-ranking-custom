/**
 * Cloudflare Workers API Gateway - Simplified Version
 * デバッグ用のシンプルな実装
 */

import { 
  checkRateLimit as performRateLimit, 
  shouldRateLimit, 
  getRateLimitConfig,
  type KVNamespace
} from './rate-limiter'

export interface Env {
  RATE_LIMIT: KVNamespace
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
  USE_PREVIEW?: string
  PREVIEW_URL?: string
  VERCEL_PROTECTION_BYPASS_SECRET?: string
  WORKER_AUTH_KEY?: string
  // PREVIEW_PROTECTION_KEY?: string  // 無効化
}

// レート制限関数は./rate-limiterからインポート

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      
      // レート制限の適用
      if (shouldRateLimit(url.pathname)) {
        const limits = getRateLimitConfig(url.pathname)
        const rateLimit = await performRateLimit(request, env.RATE_LIMIT, limits)
        
        if (!rateLimit.allowed) {
          return new Response(JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
          }), { 
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
              'X-RateLimit-Limit': String(limits.requests),
              'X-RateLimit-Remaining': String(rateLimit.remaining),
              'X-RateLimit-Reset': String(rateLimit.resetAt)
            }
          })
        }
      }
      
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
            hasRateLimit: !!env.RATE_LIMIT,
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
      
      // 認証ヘッダーを追加してプロキシ
      const proxyHeaders = new Headers(request.headers)
      // ホストヘッダーを正しく設定
      proxyHeaders.set('host', new URL(baseUrl).host)
      
      // 重要: Vercel middleware bypass用の認証ヘッダー
      if (env.WORKER_AUTH_KEY) {
        proxyHeaders.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
      } else {
        // デバッグ用：認証キーが設定されていない場合の警告
        console.warn('WORKER_AUTH_KEY is not configured')
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
      
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
      })
      
      // セキュリティヘッダーを追加
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Content-Type-Options', 'nosniff')
      newHeaders.set('X-Frame-Options', 'DENY')
      newHeaders.set('X-XSS-Protection', '1; mode=block')
      newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      // COEP を削除 - ニコニコ動画のサムネイル画像がCORSヘッダーを提供していないため
      // newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp')
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin')
      newHeaders.set('X-DNS-Prefetch-Control', 'on')
      
      // Content Security Policy (CSP) ヘッダーを追加（unsafe-evalを削除）
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