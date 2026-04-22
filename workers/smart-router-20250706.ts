/**
 * Smart Router - Blue/Green Deployment Router
 * KVからアクティブWorkerを取得してリクエストを転送
 * 
 * CORS Fix: 重複ヘッダー問題を解決済み
 */

/// <reference types="@cloudflare/workers-types" />

import { applyCORSHeaders, createOptionsResponse } from './utils/cors-config'
import { hasWorkerDebugAccess } from './utils/debug-auth'
import { Sentry, captureWorkerException, createWorkerSentryOptions, sanitizeUrlForSentry } from './sentry.js'

interface Env {
  MAINTENANCE_FLAGS: KVNamespace
  WORKER_BLUE: Fetcher
  WORKER_GREEN: Fetcher
  VERCEL_DEPLOYMENT_URL: string
  WORKER_AUTH_KEY: string
  SENTRY_WORKER_DSN?: string
  ENVIRONMENT?: string
  CF_VERSION_METADATA?: {
    id?: string
  }
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

async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const targetBase = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-custom-2ezx48med-yjsns-projects.vercel.app'
  const target = new URL(url.pathname + url.search, targetBase)

  // Hostヘッダーはfetchに任せ、オリジナルHost情報だけ伝える
  const headers = new Headers(request.headers)
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', 'https')

  const proxiedRequest = new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow'
  })

  const response = await fetch(proxiedRequest)
  return response
}

const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx
    const url = new URL(request.url)
    
    // OPTIONS リクエストの処理
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin')
      return createOptionsResponse(origin)
    }

    if (url.pathname === '/api/debug' && !hasWorkerDebugAccess(request, env.WORKER_AUTH_KEY)) {
      const origin = request.headers.get('Origin')
      const notFoundResponse = new Response('Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
        },
      })
      return applyCORSHeaders(notFoundResponse, origin, securityHeaders)
    }

    try {
      // KVからアクティブWorkerを取得（デフォルトはblue）
      const activeWorker = await env.MAINTENANCE_FLAGS.get('active_worker') || 'blue'
      
      // アクティブWorkerに基づいてFetcherを選択
      const targetWorker = activeWorker === 'green' ? env.WORKER_GREEN : env.WORKER_BLUE

      // HTMLや静的リソースは直接Vercelへプロキシ（APIのみブルー/グリーンを経由）
      const isApiRequest = url.pathname.startsWith('/api/')
      if (!isApiRequest) {
        const proxied = await proxyToVercel(request, env)
        const origin = request.headers.get('Origin')

        // HTMLページ（ルートまたは拡張子なしのパス）はブラウザキャッシュを無効化
        // これによりBFCache復元時の古いデータ問題を防ぐ
        const isHtmlPage = url.pathname === '/' ||
          (!url.pathname.includes('.') && !url.pathname.startsWith('/_next/'))

        if (isHtmlPage) {
          const headers = new Headers(proxied.headers)
          // no-storeでブラウザキャッシュを完全無効化
          // must-revalidateで条件付きリクエストを強制
          headers.set('Cache-Control', 'no-store, must-revalidate')
          headers.set('CDN-Cache-Control', 'no-store')
          headers.set('Vercel-CDN-Cache-Control', 'no-store')

          const modifiedHtml = new Response(proxied.body, {
            status: proxied.status,
            statusText: proxied.statusText,
            headers
          })
          return applyCORSHeaders(modifiedHtml, origin, {
            ...securityHeaders,
            'X-Active-Worker': activeWorker,
            'X-Router-Version': 'smart-router-20250706-bfcache-fix'
          })
        }

        // 静的アセット（JS、CSS、画像など）は通常のキャッシュを維持
        return applyCORSHeaders(proxied, origin, {
          ...securityHeaders,
          'X-Active-Worker': activeWorker,
          'X-Router-Version': 'smart-router-20250706-bfcache-fix'
        })
      }
      
      // リクエストを対象Workerに転送
      const response = await targetWorker.fetch(request)
      
      // /api/ranking 系はキャッシュを完全無効化（最終出口で強制）
      const forceNoStore =
        url.pathname.startsWith('/api/ranking') ||
        url.pathname.startsWith('/api/metadata') ||
        url.pathname.startsWith('/api/tags/autocomplete')
      
      if (forceNoStore) {
        const headers = new Headers(response.headers)
        headers.set('Cache-Control', 'no-store')
        headers.set('CDN-Cache-Control', 'no-store')
        headers.set('Vercel-CDN-Cache-Control', 'no-store')
        const body = response.body ? response.body : null
        const modified = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
        const origin = request.headers.get('Origin')
        const modifiedResponse = applyCORSHeaders(modified, origin, {
          ...securityHeaders,
          'X-Active-Worker': activeWorker,
          'X-Router-Version': 'smart-router-20250706-bfcache-fix'
        })
        return modifiedResponse
      }

      // CORS重複問題を回避して安全なヘッダーを適用
      const origin = request.headers.get('Origin')
      const modifiedResponse = applyCORSHeaders(response, origin, {
        ...securityHeaders,
        'X-Active-Worker': activeWorker,
        'X-Router-Version': 'smart-router-20250706-bfcache-fix'
      })
      
      return modifiedResponse
      
    } catch (error) {
      console.error('Smart Router Error:', error)
      captureWorkerException(error, {
        tags: {
          runtime: 'cloudflare-worker',
          surface: 'smart-router',
          endpoint_family: sanitizeUrlForSentry(request.url) || url.pathname,
          upstream_kind: 'router',
          worker_version: 'smart-router-20250706-bfcache-fix',
        },
      })
      
      // フォールバック: Blue Workerを使用
      try {
        const fallbackResponse = await env.WORKER_BLUE.fetch(request)
        const origin = request.headers.get('Origin')
        return applyCORSHeaders(fallbackResponse, origin, {
          ...securityHeaders,
          'X-Active-Worker': 'blue-fallback',
          'X-Router-Version': 'smart-router-20250706-bfcache-fix',
          'X-Router-Error': 'fallback-activated'
        })
      } catch (fallbackError) {
        console.error('Fallback Error:', fallbackError)
        captureWorkerException(fallbackError, {
          tags: {
            runtime: 'cloudflare-worker',
            surface: 'smart-router',
            endpoint_family: sanitizeUrlForSentry(request.url) || url.pathname,
            upstream_kind: 'blue-fallback',
            worker_version: 'smart-router-20250706-bfcache-fix',
          },
        })

        // 最終フォールバック: エラーレスポンス
        const origin = request.headers.get('Origin')
        const errorResponse = new Response('Internal Server Error', {
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
            'X-Router-Error': 'all-workers-failed',
            'X-Router-Version': 'smart-router-20250706-bfcache-fix'
          }
        })
        return applyCORSHeaders(errorResponse, origin, securityHeaders)
      }
    }
  }
}

export default Sentry.withSentry((env: Env) => createWorkerSentryOptions(env), handler)
