/**
 * Blue Worker - Original API Gateway Implementation
 * R2から直接ランキングデータを配信 (Blue/Green用)
 */

/// <reference types="@cloudflare/workers-types" />

import { decodeRankingData } from './utils/html-decode'

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
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
          ...corsHeaders,
          ...securityHeaders,
          'X-Worker-Version': 'blue-20250705-r2'
        }
      })
    }

    // /api/ranking パスの処理
    if (url.pathname === '/api/ranking') {
      try {
        const genre = url.searchParams.get('genre') || 'all'
        const limit = parseInt(url.searchParams.get('limit') || '100')
        
        // R2からデータを取得
        const objectKey = `ranking-${genre}.json`
        const object = await env.R2_BUCKET.get(objectKey)
        
        if (!object) {
          return new Response(JSON.stringify({ error: 'Data not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
              ...securityHeaders
            }
          })
        }

        const rawData = await object.text()
        const rankingData = JSON.parse(rawData)
        
        // HTMLエンティティのデコード
        const decodedData = decodeRankingData(rankingData)
        
        // レスポンス
        return new Response(JSON.stringify(decodedData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
            'X-Data-Source': 'r2-blue-worker',
            'X-Worker-Version': 'blue-20250705-r2',
            ...corsHeaders,
            ...securityHeaders
          }
        })

      } catch (error) {
        console.error('Error fetching ranking data:', error)
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            ...securityHeaders
          }
        })
      }
    }

    // その他のリクエストはVercelに転送
    const vercelUrl = new URL(url.pathname + url.search, env.VERCEL_DEPLOYMENT_URL)
    
    return fetch(vercelUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body
    })
  }
}