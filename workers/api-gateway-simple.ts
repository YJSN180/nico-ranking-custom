/**
 * Cloudflare Workers API Gateway - Simplified Version
 * デバッグ用のシンプルな実装
 */

interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

export interface Env {
  RATE_LIMIT: KVNamespace
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
  USE_PREVIEW?: string
  PREVIEW_URL?: string
  VERCEL_PROTECTION_BYPASS_SECRET?: string
  WORKER_AUTH_KEY?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      
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
            hasRankingData: !!env.RANKING_DATA
          },
          request: {
            url: request.url,
            method: request.method,
            headers: {} // Headers simplified for debugging
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
      proxyHeaders.set('X-Worker-Auth', env.WORKER_AUTH_KEY || '')
      
      // Vercel Protection Bypassヘッダーを追加
      if (env.VERCEL_PROTECTION_BYPASS_SECRET) {
        proxyHeaders.set('x-vercel-protection-bypass', env.VERCEL_PROTECTION_BYPASS_SECRET)
        proxyHeaders.set('x-vercel-set-bypass-cookie', 'true')
      }
      
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: request.body
      })
      
      // セキュリティヘッダーを追加
      const newHeaders = new Headers(response.headers)
      newHeaders.set('X-Content-Type-Options', 'nosniff')
      newHeaders.set('X-Frame-Options', 'DENY')
      newHeaders.set('X-XSS-Protection', '1; mode=block')
      newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      
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