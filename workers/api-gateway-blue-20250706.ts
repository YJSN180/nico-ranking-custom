/**
 * Blue Worker - Original API Gateway Implementation
 * R2から直接ランキングデータを配信 (Blue/Green用)
 * 
 * 🔵 バックアップWorker (待機中)
 * Blue/Green デプロイメント戦略において、このBlue Workerは現在バックアップとして待機中です
 * 
 * 実装状況 (2025-07-06更新):
 * ✅ /api/ranking - R2からランキングデータ取得
 * ✅ /api/debug - デバッグ情報
 * ✅ /api/thumbnail/{videoId} - サムネイル取得API (KVキャッシュなし、CDNキャッシュのみ)
 * 
 * 注意事項:
 * - サムネイルAPIはKVキャッシュを使用しない（個人差でキャッシュヒット率が低いため）
 * - CDNレベルでキャッシュ: ブラウザ1時間、CDN24時間
 * - サムネイル取得にはnicovideo.gayミラーサイトを使用
 */

/// <reference types="@cloudflare/workers-types" />

import { decodeRankingData } from './utils/html-decode'
import { applyCORSHeaders, createOptionsResponse } from './utils/cors-config'

interface Env {
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  R2_BUCKET: R2Bucket
  RANKING_DATA: KVNamespace
  RATE_LIMITER: any // Cloudflare Rate Limiting binding
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

// CORSヘッダーは ./utils/cors-config.ts で統一管理

/**
 * IP別レート制限チェック（サムネイル取得API用）
 * 20リクエスト/分の制限を適用
 */
async function checkRateLimit(request: Request, env: Env, endpoint: string = 'general'): Promise<{ success: boolean; error?: Response }> {
  try {
    // クライアントIPを取得（Cloudflare経由）
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For') || 
                     'unknown'
    
    // レート制限キー（IP + エンドポイント）
    const limitKey = `${clientIP}:${endpoint}`
    
    // Rate Limiting APIを使用（20req/分制限）
    const { success } = await env.RATE_LIMITER.limit({
      key: limitKey
    })
    
    if (!success) {
      const errorResponse = new Response(
        JSON.stringify({ 
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: 60
        }), 
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': '20',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + 60).toString()
          }
        }
      )
      return { success: false, error: errorResponse }
    }
    
    return { success: true }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // レート制限エラーの場合はリクエストを通す（フェイルオープン）
    return { success: true }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin')
      return createOptionsResponse(origin)
    }
    
    // /api/debug パスの処理（デバッグ情報を返す）
    if (url.pathname === '/api/debug') {
      const debugResponse = new Response(JSON.stringify({
        time: new Date().toISOString(),
        headers: Object.fromEntries(request.headers),
        worker: 'api-gateway-blue-20250706',
        version: 'blue-20250706-unified-cors',
        features: ['r2-storage', 'html-decode', 'unified-cors', 'blue-20250706']
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Version': 'blue-20250706-unified-cors'
        }
      })
      
      const origin = request.headers.get('Origin')
      return applyCORSHeaders(debugResponse, origin, securityHeaders)
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
          const notFoundResponse = new Response(JSON.stringify({ error: 'Data not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
        }

        const rawData = await object.text()
        const rankingData = JSON.parse(rawData)
        
        // HTMLエンティティのデコード
        const decodedData = decodeRankingData(rankingData)
        
        // レスポンス
        const rankingResponse = new Response(JSON.stringify(decodedData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
            'X-Data-Source': 'r2-blue-worker',
            'X-Worker-Version': 'blue-20250706-unified-cors'
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(rankingResponse, origin, securityHeaders)

      } catch (error) {
        console.error('Error fetching ranking data:', error)
        const errorResponse = new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        })
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
      }
    }

    // /api/thumbnail/{videoId} パスの処理
    if (url.pathname.startsWith('/api/thumbnail/')) {
      try {
        const videoId = url.pathname.split('/').pop()
        
        if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
          const invalidIdResponse = new Response(JSON.stringify({ error: 'Invalid video ID' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(invalidIdResponse, origin, securityHeaders)
        }
        
        // レート制限チェック（サムネイル取得API用）
        const rateLimitCheck = await checkRateLimit(request, env, 'thumbnail')
        if (!rateLimitCheck.success) {
          return rateLimitCheck.error!
        }
        
        // ニコニコ動画から動画ページを取得（キャッシュなし）
        // nico-thumb-appのロジックを参考に、ミラーサイトとUser-Agent偽装を使用
        const nicoResponse = await fetch(`https://www.nicovideo.gay/watch/${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept-Language': 'ja,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        })
        
        if (!nicoResponse.ok) {
          const notFoundResponse = new Response(JSON.stringify({ error: 'Video not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const origin = request.headers.get('Origin')
          return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
        }
        
        // HTMLからOGP画像URLを抽出
        const html = await nicoResponse.text()
        const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
        let thumbnailUrl = ogImageMatch ? ogImageMatch[1] : null
        
        // サムネイルURLを大きいサイズに変換
        if (thumbnailUrl) {
          // nico-thumb-appの方法を参考に、より確実な変換を行う
          
          // originalサイズのURLの場合はそのまま使用
          if (thumbnailUrl.includes('.original') || thumbnailUrl.includes('/original/')) {
            console.log('Already original size thumbnail:', thumbnailUrl)
          } else {
            // ニコニコ動画のサムネイルURL形式
            // 例: https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678
            // 例: https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.12345678.M
            
            // クエリパラメータを分離
            const [urlBase, urlQuery] = thumbnailUrl.split('?')
            
            // 既存のサイズ指定を削除（.数字の後の.Mや.Lを削除）
            let cleanUrl = urlBase.replace(/\.(M|L)($|\/)/g, '$2')
            
            // .Lを追加（拡張子の前または末尾に）
            if (cleanUrl.match(/\.\d+$/)) {
              // 数字で終わる場合（例: 12345678.12345678）
              cleanUrl = cleanUrl + '.L'
            } else if (cleanUrl.match(/\.\d+\//)) {
              // 数字の後にスラッシュがある場合
              cleanUrl = cleanUrl.replace(/(\.\d+)(\/)/g, '$1.L$2')
            } else {
              // その他の場合は末尾に追加
              cleanUrl = cleanUrl + '.L'
            }
            
            // クエリパラメータを再結合
            thumbnailUrl = urlQuery ? `${cleanUrl}?${urlQuery}` : cleanUrl
            console.log('Converted to large thumbnail:', thumbnailUrl)
          }
        }
        
        const result = JSON.stringify({ 
          videoId,
          thumbnail: thumbnailUrl
        })
        
        const thumbnailResponse = new Response(result, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            // CDNレベルでのキャッシュのみ（個人差があるためKVキャッシュは使用しない）
            'Cache-Control': 'public, max-age=3600, s-maxage=86400' // ブラウザ1時間、CDN24時間
          }
        })
        
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(thumbnailResponse, origin, securityHeaders)
        
      } catch (error) {
        console.error('Error fetching thumbnail:', error)
        const errorResponse = new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        })
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
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