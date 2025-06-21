/**
 * Cloudflare Workers API Gateway - Optimized Version V2
 * メモリ効率を改善したKV最適化実装
 */

import { getGroupIdForGenre, extractGenreData, getCachedResponse } from './kv-optimization'

export interface Env {
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
  USE_PREVIEW?: string
  PREVIEW_URL?: string
  VERCEL_PROTECTION_BYPASS_SECRET?: string
  WORKER_AUTH_KEY?: string
  // Feature flags
  ENABLE_KV_OPTIMIZATION?: string
  KV_OPTIMIZATION_PERCENTAGE?: string // 0-100 for gradual rollout
}

// Check if KV optimization should be used for this request
function shouldUseKVOptimization(env: Env, request: Request): boolean {
  if (env.ENABLE_KV_OPTIMIZATION !== 'true') {
    return false
  }
  
  // Gradual rollout based on percentage
  const percentage = parseInt(env.KV_OPTIMIZATION_PERCENTAGE || '100', 10)
  if (percentage < 100) {
    // Use request URL hash for consistent routing
    const hash = Array.from(request.url).reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return (hash % 100) < percentage
  }
  
  return true
}

// Apply security headers
function applySecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers)
  
  // Security headers
  newHeaders.set('X-Content-Type-Options', 'nosniff')
  newHeaders.set('X-Frame-Options', 'DENY')
  newHeaders.set('X-XSS-Protection', '1; mode=block')
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin')
  newHeaders.set('X-DNS-Prefetch-Control', 'on')
  
  // Content Security Policy (CSP)
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
}

// Proxy request to Vercel
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  
  // Determine target URL
  const usePreview = env.USE_PREVIEW === 'true' && env.PREVIEW_URL
  const targetUrl = usePreview ? env.PREVIEW_URL : env.NEXT_APP_URL
  
  if (!targetUrl) {
    return new Response('Target URL not configured', { status: 500 })
  }
  
  // Update URL
  url.protocol = 'https:'
  url.hostname = new URL(targetUrl).hostname
  url.port = ''
  
  // Clone headers
  const headers = new Headers(request.headers)
  headers.set('Host', url.hostname)
  headers.set('X-Forwarded-Host', new URL(request.url).hostname)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  
  // Add auth headers if configured
  if (env.WORKER_AUTH_KEY) {
    headers.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  if (usePreview && env.VERCEL_PROTECTION_BYPASS_SECRET) {
    headers.set('x-vercel-protection-bypass', env.VERCEL_PROTECTION_BYPASS_SECRET)
    headers.set('x-vercel-set-bypass-cookie', 'true')
  }
  
  // Proxy the request
  const response = await fetch(url.toString(), {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual'
  })
  
  return applySecurityHeaders(response)
}

// Handle optimized ranking API requests
async function handleOptimizedRankingAPI(
  request: Request,
  env: Env,
  genre: string,
  period: string,
  tag?: string
): Promise<Response> {
  // Tag rankings are dynamic, proxy to Vercel
  if (tag) {
    return proxyToVercel(request, env)
  }
  
  // Build cache key
  const cacheKey = new Request(`https://internal/ranking/${genre}/${period}`)
  
  return getCachedResponse(cacheKey.url, async () => {
    try {
      // Determine which group to read
      const groupId = getGroupIdForGenre(genre)
      const kvKey = `RANKING_GROUP_${groupId}`
      
      // Read compressed data from KV
      const compressedData = await env.RANKING_DATA.get(kvKey, { type: 'arrayBuffer' })
      
      if (!compressedData) {
        // Fallback to proxy if data not found
        return proxyToVercel(request, env)
      }
      
      // Extract only the needed genre/period data
      const data = await extractGenreData(
        new Uint8Array(compressedData),
        genre,
        period
      )
      
      // Generate ETag
      const etag = `"${genre}-${period}-${data.metadata?.updatedAt || 'unknown'}"`
      
      // Check conditional request
      if (request.headers.get('if-none-match') === etag) {
        return new Response(null, { status: 304 })
      }
      
      // Return optimized response
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
          'ETag': etag,
          'X-Cache-Status': 'KV-HIT',
          'X-KV-Group': String(groupId),
          'X-KV-Optimized': 'true'
        }
      })
    } catch (error) {
      // Fallback to proxy on any error
      return proxyToVercel(request, env)
    }
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    
    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 })
    }
    
    // Debug endpoint
    if (url.pathname === '/debug/kv-opt') {
      return new Response(JSON.stringify({
        mode: 'KV_OPTIMIZED_V2',
        features: {
          kvOptimization: env.ENABLE_KV_OPTIMIZATION === 'true',
          percentage: env.KV_OPTIMIZATION_PERCENTAGE || '100',
          groupSplit: true,
          cacheAPI: true,
          memoryEfficient: true
        },
        env: {
          hasRankingData: !!env.RANKING_DATA,
          hasWorkerAuthKey: !!env.WORKER_AUTH_KEY,
          targetUrl: env.NEXT_APP_URL || 'NOT SET'
        }
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Handle ranking API requests
    if (url.pathname === '/api/ranking' || url.pathname === '/api/edge/ranking') {
      const genre = url.searchParams.get('genre') || 'all'
      const period = url.searchParams.get('period') || '24h'
      const tag = url.searchParams.get('tag')
      
      // Validate period
      if (!['24h', 'hour'].includes(period)) {
        return new Response(JSON.stringify({ error: 'Invalid period' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // Check if KV optimization should be used
      if (shouldUseKVOptimization(env, request)) {
        return handleOptimizedRankingAPI(request, env, genre, period, tag)
      }
    }
    
    // Default: proxy all requests to Vercel
    return proxyToVercel(request, env)
  }
}