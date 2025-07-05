/**
 * Smart Router - Blue/Green Deployment Router
 * KVからアクティブWorkerを取得してリクエストを転送
 */

/// <reference types="@cloudflare/workers-types" />

interface Env {
  MAINTENANCE_FLAGS: KVNamespace
  WORKER_BLUE: Fetcher
  WORKER_GREEN: Fetcher
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
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

    try {
      // KVからアクティブWorkerを取得（デフォルトはblue）
      const activeWorker = await env.MAINTENANCE_FLAGS.get('active_worker') || 'blue'
      
      // アクティブWorkerに基づいてFetcherを選択
      const targetWorker = activeWorker === 'green' ? env.WORKER_GREEN : env.WORKER_BLUE
      
      // リクエストを対象Workerに転送
      const response = await targetWorker.fetch(request)
      
      // レスポンスをクローンして追加ヘッダーを付与
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers),
          ...corsHeaders,
          ...securityHeaders,
          'X-Active-Worker': activeWorker,
          'X-Router-Version': 'smart-router-20250705'
        }
      })
      
      return modifiedResponse
      
    } catch (error) {
      console.error('Smart Router Error:', error)
      
      // フォールバック: Blue Workerを使用
      try {
        const fallbackResponse = await env.WORKER_BLUE.fetch(request)
        return new Response(fallbackResponse.body, {
          status: fallbackResponse.status,
          statusText: fallbackResponse.statusText,
          headers: {
            ...Object.fromEntries(fallbackResponse.headers),
            ...corsHeaders,
            ...securityHeaders,
            'X-Active-Worker': 'blue-fallback',
            'X-Router-Version': 'smart-router-20250705',
            'X-Router-Error': 'fallback-activated'
          }
        })
      } catch (fallbackError) {
        console.error('Fallback Error:', fallbackError)
        
        // 最終フォールバック: エラーレスポンス
        return new Response('Internal Server Error', {
          status: 500,
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            'X-Router-Error': 'all-workers-failed',
            'X-Router-Version': 'smart-router-20250705'
          }
        })
      }
    }
  }
}