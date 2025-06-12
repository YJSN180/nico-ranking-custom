/**
 * Cloudflare Workers API Gateway
 * 
 * DDoS保護、レート制限、キャッシング、セキュリティヘッダー
 */

import type { KVNamespace, ExecutionContext, CacheStorage } from './cloudflare.d'

declare const caches: CacheStorage

export interface Env {
  RATE_LIMIT: KVNamespace
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
  VERCEL_PROTECTION_BYPASS_SECRET?: string
}

// レート制限設定（より厳格に）
const RATE_LIMIT_CONFIG = {
  general: { requests: 60, window: 60 },     // 1分間に60リクエスト
  burst: { requests: 10, window: 10 },       // 10秒間に10リクエスト（バースト）
  ranking: { requests: 20, window: 60 },     // ランキングAPIは1分間に20リクエスト
  bot: { requests: 5, window: 60 }           // ボットは1分間に5リクエストまで
}

// リクエスト結合用のマップ
const pendingRequests = new Map<string, Promise<Response>>()

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // セキュリティヘッダーを追加
    const addSecurityHeaders = (response: Response): Response => {
      const headers = new Headers(response.headers)
      
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('X-Frame-Options', 'DENY')
      headers.set('X-XSS-Protection', '1; mode=block')
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;")
      
      // CORS設定
      if (url.pathname.startsWith('/api/')) {
        headers.set('Access-Control-Allow-Origin', env.NEXT_APP_URL)
        headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        headers.set('Access-Control-Allow-Headers', 'Content-Type')
        headers.set('Access-Control-Max-Age', '86400')
      }
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      return addSecurityHeaders(new Response(null, { status: 204 }))
    }
    
    // IPアドレスとユーザーエージェントの取得
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const userAgent = request.headers.get('User-Agent') || ''
    
    // ボット検出（簡易版）
    const isBot = /bot|crawler|spider|scraper|ahrefsbot|bingbot|duckduckbot|facebookexternalhit|twitterbot|whatsapp|telegram/i.test(userAgent)
    
    // ボットは厳しいレート制限
    const rateLimitKey = `rate:${ip}:${isBot ? 'bot' : 'human'}`
    const rateConfig = isBot ? RATE_LIMIT_CONFIG.bot : RATE_LIMIT_CONFIG.general
    
    // レート制限チェック
    const now = Date.now()
    const windowMs = rateConfig.window * 1000
    const rateLimitData = await env.RATE_LIMIT.get(rateLimitKey, { type: 'json' }) as { count: number, reset: number } | null
    
    if (rateLimitData && now < rateLimitData.reset) {
      if (rateLimitData.count >= rateConfig.requests) {
        return new Response(
          JSON.stringify({
            error: 'Too many requests',
            message: 'レート制限に達しました。しばらくお待ちください。'
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': Math.ceil((rateLimitData.reset - now) / 1000).toString(),
              'X-RateLimit-Limit': rateConfig.requests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(rateLimitData.reset).toISOString()
            }
          }
        )
      }
      
      // カウントをインクリメント
      await env.RATE_LIMIT.put(
        rateLimitKey,
        JSON.stringify({ count: rateLimitData.count + 1, reset: rateLimitData.reset }),
        { expirationTtl: Math.ceil((rateLimitData.reset - now) / 1000) }
      )
    } else {
      // 新しいウィンドウ
      await env.RATE_LIMIT.put(
        rateLimitKey,
        JSON.stringify({ count: 1, reset: now + windowMs }),
        { expirationTtl: rateConfig.window }
      )
    }
    
    // 静的アセットのキャッシュ
    if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
      const cache = caches.default
      let response = await cache.match(request)
      
      if (!response) {
        response = await fetch(request)
        
        if (response.ok) {
          const headers = new Headers(response.headers)
          headers.set('Cache-Control', 'public, max-age=31536000, immutable')
          
          const cachedResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
          })
          
          ctx.waitUntil(cache.put(request, cachedResponse.clone()))
          return addSecurityHeaders(cachedResponse)
        }
      }
      
      return addSecurityHeaders(response)
    }
    
    // ランキングAPIのキャッシュ
    if (url.pathname === '/api/ranking') {
      const cache = caches.default
      const cacheKey = new Request(url.toString(), {
        method: 'GET',
        headers: { 'Cache-Key': url.search }
      })
      
      let response = await cache.match(cacheKey)
      
      if (!response) {
        // キャッシュミス時はNext.jsアプリケーションに転送
        try {
          // Vercel Protection Bypassのヘッダーを追加
          const apiHeaders = new Headers(request.headers)
          if (env.VERCEL_PROTECTION_BYPASS_SECRET) {
            apiHeaders.set('x-vercel-protection-bypass', env.VERCEL_PROTECTION_BYPASS_SECRET)
            apiHeaders.set('x-vercel-set-bypass-cookie', 'true')
          }
          
          response = await fetch(`${env.NEXT_APP_URL}${url.pathname}${url.search}`, {
            method: request.method,
            headers: apiHeaders,
            body: request.body
          })
          
          if (response.ok) {
            const headers = new Headers(response.headers)
            headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
            
            const cachedResponse = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers
            })
            
            ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()))
            return addSecurityHeaders(cachedResponse)
          }
        } catch (error) {
          console.error('Backend error:', error)
          
          return new Response(
            JSON.stringify({
              error: 'Service temporarily unavailable',
              message: 'サービスが一時的に利用できません。'
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': '30'
              }
            }
          )
        }
      }
      
      return addSecurityHeaders(response)
    }
    
    // その他のリクエストはNext.jsアプリケーションに転送
    try {
      // デバッグ用: NEXT_APP_URLの確認
      if (!env.NEXT_APP_URL) {
        return new Response(
          JSON.stringify({
            error: 'Configuration error',
            message: 'NEXT_APP_URL is not configured',
            debug: {
              pathname: url.pathname,
              search: url.search
            }
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
      }
      
      const targetUrl = `${env.NEXT_APP_URL}${url.pathname}${url.search}`
      
      // Vercel Protection Bypassのヘッダーを追加
      const headers = new Headers(request.headers)
      // ホストヘッダーを正しく設定
      headers.set('host', new URL(env.NEXT_APP_URL).host)
      if (env.VERCEL_PROTECTION_BYPASS_SECRET) {
        headers.set('x-vercel-protection-bypass', env.VERCEL_PROTECTION_BYPASS_SECRET)
        headers.set('x-vercel-set-bypass-cookie', 'true')
      }
      
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
      })
      
      return addSecurityHeaders(response)
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Service unavailable', 
          message: error instanceof Error ? error.message : 'Unknown error',
          debug: {
            nextAppUrl: env.NEXT_APP_URL,
            pathname: url.pathname
          }
        }), 
        { 
          status: 503,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }
  }
}