/**
 * Smart Router - Blue/Green Deployment Router
 * KVからアクティブWorkerを取得してリクエストを転送
 * 
 * CORS Fix: 重複ヘッダー問題を解決済み
 */

/// <reference types="@cloudflare/workers-types" />

import { applyCORSHeaders, createOptionsResponse } from './utils/cors-config'

interface Env {
  MAINTENANCE_FLAGS: KVNamespace
  WORKER_BLUE: Fetcher
  WORKER_GREEN: Fetcher
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
}

// セキュリティヘッダー定義
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com https://vercel.live https://static.cloudflareinsights.com https://*.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; media-src 'self' https:; object-src 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'on'
}

// CORSヘッダーは ./utils/cors-config.ts で統一管理

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin')
      return createOptionsResponse(origin)
    }

    try {
      // KVからアクティブWorkerを取得（デフォルトはblue）
      const activeWorker = await env.MAINTENANCE_FLAGS.get('active_worker') || 'blue'
      
      // アクティブWorkerに基づいてFetcherを選択
      const targetWorker = activeWorker === 'green' ? env.WORKER_GREEN : env.WORKER_BLUE
      
      // リクエストを対象Workerに転送
      const response = await targetWorker.fetch(request)
      
      // CORS重複問題を回避して安全なヘッダーを適用
      const origin = request.headers.get('Origin')
      const modifiedResponse = applyCORSHeaders(response, origin, {
        ...securityHeaders,
        'X-Active-Worker': activeWorker,
        'X-Router-Version': 'smart-router-20250706-fixed'
      })
      
      return modifiedResponse
      
    } catch (error) {
      console.error('Smart Router Error:', error)
      
      // フォールバック: Blue Workerを使用
      try {
        const fallbackResponse = await env.WORKER_BLUE.fetch(request)
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(fallbackResponse, origin, {
          ...securityHeaders,
          'X-Active-Worker': 'blue-fallback',
          'X-Router-Version': 'smart-router-20250706-fixed',
          'X-Router-Error': 'fallback-activated'
        })
      } catch (fallbackError) {
        console.error('Fallback Error:', fallbackError)
        
        // 最終フォールバック: エラーレスポンス
        const origin = request.headers.get('Origin')
        const errorResponse = new Response('Internal Server Error', {
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
            'X-Router-Error': 'all-workers-failed',
            'X-Router-Version': 'smart-router-20250706-fixed'
          }
        })
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
      }
    }
  }
}