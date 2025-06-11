/**
 * Cloudflare Workers API Gateway - Simplified Version
 * デバッグ用のシンプルな実装
 */

export interface Env {
  RATE_LIMIT: KVNamespace
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      
      // デバッグ情報
      if (url.pathname === '/debug') {
        return new Response(JSON.stringify({
          env: {
            NEXT_APP_URL: env.NEXT_APP_URL || 'NOT SET',
            hasRateLimit: !!env.RATE_LIMIT,
            hasRankingData: !!env.RANKING_DATA
          },
          request: {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries())
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // シンプルなプロキシ
      if (!env.NEXT_APP_URL) {
        return new Response('NEXT_APP_URL not configured', { status: 500 })
      }
      
      const targetUrl = `${env.NEXT_APP_URL}${url.pathname}${url.search}`
      
      // 認証ヘッダーを追加してプロキシ
      const proxyHeaders = new Headers(request.headers)
      proxyHeaders.set('X-Worker-Auth', 'nico-rank-secure-2025')
      
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