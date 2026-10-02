import { fetchUpstream, isAdminPath, isSafeMethod, noStore } from './utils/upstream-proxy'
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

export function buildProxyRequestInit(
  request: Request,
  headers: Headers,
  redirect: RequestRedirect,
  replayableBody?: ArrayBuffer | null,
): RequestInit {
  const method = request.method.toUpperCase()

  if (method === 'GET' || method === 'HEAD') {
    return {
      method: request.method,
      headers,
      redirect,
    }
  }

  return {
    method: request.method,
    headers,
    body: replayableBody ?? undefined,
    redirect,
  }
}

// 再送用に本文をメモリへ読むため上限を設ける。Vercel の関数は 4.5MB を超える本文を受け付けないので、
// これより大きい本文は転送しても失敗する。上限が無いと大きな POST 1 件で isolate のメモリ上限（128MB）に届き、
// 同じ isolate の他のリクエストもまとめて落ちる
const MAX_REPLAYABLE_BODY_BYTES = 5 * 1024 * 1024

class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body too large')
    this.name = 'RequestBodyTooLargeError'
  }
}

export async function readReplayableBody(
  request: Request,
  maxBytes: number = MAX_REPLAYABLE_BODY_BYTES,
): Promise<ArrayBuffer | null> {
  const method = request.method.toUpperCase()

  if (method === 'GET' || method === 'HEAD') {
    return null
  }

  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError()
  }
  if (!request.body) {
    return new ArrayBuffer(0)
  }

  // clone() せずに直接読む（tee で同じ本文をもう一つ溜めない）。以降は読み取った ArrayBuffer だけを使う
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new RequestBodyTooLargeError()
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer
}

function buildReplayableRequest(
  sourceUrl: string,
  request: Request,
  body: ArrayBuffer | null,
  redirect: RequestRedirect,
): Request {
  const headers = new Headers(request.headers)
  return new Request(sourceUrl, buildProxyRequestInit(request, headers, redirect, body))
}

async function proxyToVercel(
  request: Request,
  env: Env,
  replayableBody: ArrayBuffer | null,
): Promise<Response> {
  const targetBase = env.VERCEL_DEPLOYMENT_URL || 'https://nico-ranking-custom-yjsns-projects.vercel.app'
  return fetchUpstream(buildReplayableRequest(request.url, request, replayableBody, 'manual'), targetBase)
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

    let replayableBody: ArrayBuffer | null
    try {
      replayableBody = await readReplayableBody(request)
    } catch (error) {
      if (!(error instanceof RequestBodyTooLargeError)) throw error
      const tooLargeResponse = new Response('Payload Too Large', {
        status: 413,
        headers: {
          'Content-Type': 'text/plain',
        },
      })
      return applyCORSHeaders(tooLargeResponse, request.headers.get('Origin'), securityHeaders)
    }

    // Admin requests have one origin and no blue/green failover. Never replay writes.
    if (isAdminPath(url.pathname)) {
      try {
        return noStore(await proxyToVercel(request, env, replayableBody))
      } catch {
        return noStore(new Response('Gateway Error', { status: 502 }))
      }
    }

    try {
      // HTMLや静的リソースは直接Vercelへプロキシ（APIのみブルー/グリーンを経由）
      const isApiRequest = url.pathname.startsWith('/api/')
      if (!isApiRequest) {
        const proxied = await proxyToVercel(request, env, replayableBody)
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
            'X-Router-Version': 'smart-router-20250706-bfcache-fix'
          })
        }

        // 静的アセット（JS、CSS、画像など）は通常のキャッシュを維持
        return applyCORSHeaders(proxied, origin, {
          ...securityHeaders,
          'X-Router-Version': 'smart-router-20250706-bfcache-fix'
        })
      }

      // APIだけが切替先を必要とする。毎回読み、切替・ロールバックの反映を遅らせない。
      const activeWorker = await env.MAINTENANCE_FLAGS.get('active_worker') || 'blue'
      const targetWorker = activeWorker === 'green' ? env.WORKER_GREEN : env.WORKER_BLUE
      
      // リクエストを対象Workerに転送
      const response = await targetWorker.fetch(
        buildReplayableRequest(request.url, request, replayableBody, 'follow'),
      )
      
      // /api/ranking 系はキャッシュを完全無効化（最終出口で強制）。
      // タグ候補は Green の Cache-Control（5 分）をそのまま返す
      const forceNoStore =
        url.pathname.startsWith('/api/ranking') ||
        url.pathname.startsWith('/api/metadata')
      
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
      
      if (!isSafeMethod(request.method)) {
        return noStore(new Response('Gateway Error', { status: 502 }))
      }

      // フォールバック: Blue Workerを使用
      try {
        const fallbackResponse = await env.WORKER_BLUE.fetch(
          buildReplayableRequest(request.url, request, replayableBody, 'follow'),
        )
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
