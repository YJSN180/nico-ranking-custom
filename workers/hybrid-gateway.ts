/**
 * Cloudflare Workers API Gateway - Hybrid Version
 * 段階的移行用：KV最適化とプロキシーのハイブリッド
 */

// Dynamic import for compression support
let pako: any

export interface Env {
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
  USE_PREVIEW?: string
  PREVIEW_URL?: string
  VERCEL_PROTECTION_BYPASS_SECRET?: string
  WORKER_AUTH_KEY?: string
  // Feature flags for gradual rollout
  ENABLE_KV_OPTIMIZATION?: string
  FALLBACK_TO_PROXY?: string
}

// Cache for decompressed data
const memoryCache = new Map<string, { data: any; timestamp: number; etag: string }>()
const CACHE_TTL = 60 * 1000 // 1 minute

// Feature flag helpers
function isKVOptimizationEnabled(env: Env): boolean {
  return env.ENABLE_KV_OPTIMIZATION === 'true'
}

function shouldFallbackToProxy(env: Env): boolean {
  return env.FALLBACK_TO_PROXY === 'true'
}

// Generate ETag for content
async function generateETag(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `"${hashHex.substring(0, 16)}"`
}

// Decompress gzipped data
async function decompressData(compressed: Uint8Array): Promise<any> {
  if (!pako) {
    pako = await import('pako')
  }
  const jsonString = pako.ungzip(compressed, { to: 'string' })
  return JSON.parse(jsonString)
}

// Get ranking data directly from KV binding (optimized version)
async function getRankingDataFromKV(env: Env): Promise<any> {
  const cacheKey = 'RANKING_LATEST'
  const now = Date.now()
  
  // Check memory cache
  const cached = memoryCache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return { data: cached.data, etag: cached.etag }
  }
  
  try {
    const result = await env.RANKING_DATA.getWithMetadata<Uint8Array>(
      'RANKING_LATEST',
      { type: 'arrayBuffer' }
    )
    
    if (!result.value) {
      return { data: null, etag: null }
    }

    // Decompress if needed
    let data: any
    
    // Check if data is gzipped by looking at magic bytes
    const bytes = new Uint8Array(result.value)
    const isGzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
    
    if (isGzipped) {
      // Data has gzip magic bytes - always decompress
      data = await decompressData(bytes)
    } else if (result.metadata?.compressed === true) {
      // Metadata explicitly says compressed (but no gzip magic bytes - shouldn't happen)
      data = await decompressData(bytes)
    } else if (result.metadata?.compressed === false) {
      // Metadata explicitly says uncompressed
      data = JSON.parse(new TextDecoder().decode(result.value))
    } else {
      // No metadata and no gzip magic bytes - try to parse as JSON
      try {
        data = JSON.parse(new TextDecoder().decode(result.value))
      } catch (jsonError) {
        // If JSON parsing fails, assume it's compressed
        console.log('[HYBRID] JSON parse failed, trying decompression')
        data = await decompressData(bytes)
      }
    }
    
    // Generate ETag
    const etag = await generateETag(JSON.stringify(data))
    
    // Update memory cache
    memoryCache.set(cacheKey, { data, timestamp: now, etag })
    
    return { data, etag }
  } catch (error) {
    console.error('[HYBRID] Failed to read RANKING_LATEST:', error)
    return { data: null, etag: null }
  }
}

// Handle ranking API requests with KV optimization or proxy fallback
async function handleRankingAPI(request: Request, env: Env): Promise<Response> {
  if (isKVOptimizationEnabled(env)) {
    try {
      const url = new URL(request.url)
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
      
      const { data: allData, etag } = await getRankingDataFromKV(env)
      
      if (!allData || !allData.genres) {
        if (shouldFallbackToProxy(env)) {
          console.log('[HYBRID] KV optimization failed, falling back to proxy')
          return await proxyToVercel(request, env)
        }
        return new Response(JSON.stringify({ error: 'No ranking data available' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // Check conditional request
      if (request.headers.get('if-none-match') === etag) {
        return new Response(null, { status: 304 })
      }
      
      let responseData: any
      
      if (tag) {
        // Tag-specific ranking
        const genreData = allData.genres[genre]?.[period]
        if (!genreData || !genreData.tags || !genreData.tags[tag]) {
          responseData = { items: [], hasMore: false, totalCached: 0 }
        } else {
          responseData = {
            items: genreData.tags[tag] || [],
            hasMore: false,
            totalCached: genreData.tags[tag]?.length || 0
          }
        }
      } else {
        // Genre ranking
        const genreData = allData.genres[genre]?.[period]
        if (!genreData) {
          responseData = { items: [], popularTags: [] }
        } else {
          responseData = {
            items: genreData.items?.slice(0, 500) || [],
            popularTags: genreData.popularTags || []
          }
        }
      }
      
      return new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
          'ETag': etag || '',
          'X-Cache-Status': 'KV-OPTIMIZED-HYBRID',
          'X-API-Version': 'hybrid'
        }
      })
    } catch (error) {
      console.error('[HYBRID] KV optimization error:', error)
      
      if (shouldFallbackToProxy(env)) {
        console.log('[HYBRID] Falling back to proxy due to error')
        return await proxyToVercel(request, env)
      }
      
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
  
  // Fallback to proxy if KV optimization is disabled
  return await proxyToVercel(request, env)
}

// Proxy request to Vercel
async function proxyToVercel(request: Request, env: Env): Promise<Response> {
  const baseUrl = env.USE_PREVIEW === 'true' && env.PREVIEW_URL 
    ? env.PREVIEW_URL 
    : env.NEXT_APP_URL
    
  if (!baseUrl) {
    return new Response('Target URL not configured', { status: 500 })
  }
  
  const url = new URL(request.url)
  const targetUrl = `${baseUrl}${url.pathname}${url.search}`
  
  // Add authentication headers
  const proxyHeaders = new Headers(request.headers)
  
  if (env.WORKER_AUTH_KEY) {
    proxyHeaders.set('X-Worker-Auth', env.WORKER_AUTH_KEY)
  }
  
  if (env.VERCEL_PROTECTION_BYPASS_SECRET) {
    proxyHeaders.set('x-vercel-protection-bypass', env.VERCEL_PROTECTION_BYPASS_SECRET)
    proxyHeaders.set('x-vercel-set-bypass-cookie', 'true')
  }
  
  proxyHeaders.set('Host', new URL(targetUrl).host)
  proxyHeaders.set('X-Forwarded-Host', 'nico-rank.com')
  proxyHeaders.set('X-Forwarded-Proto', 'https')
  
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: proxyHeaders,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
  })
  
  // Add proxy indicator header
  const newHeaders = new Headers(response.headers)
  newHeaders.set('X-Cache-Status', 'PROXY-FALLBACK')
  newHeaders.set('X-API-Version', 'hybrid-proxy')
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}

// Apply security headers to any response
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      
      // Handle ranking API with KV optimization or proxy fallback
      if (url.pathname === '/api/edge/ranking') {
        const response = await handleRankingAPI(request, env)
        return applySecurityHeaders(response)
      }
      
      // For video stats, use proxy for now (can be optimized later)
      if (url.pathname === '/api/edge/video-stats') {
        const response = await proxyToVercel(request, env)
        return applySecurityHeaders(response)
      }
      
      // Debug endpoint with feature flag status
      if (url.pathname === '/debug') {
        const targetUrl = env.USE_PREVIEW === 'true' && env.PREVIEW_URL 
          ? env.PREVIEW_URL 
          : env.NEXT_APP_URL
          
        return new Response(JSON.stringify({
          mode: 'HYBRID',
          env: {
            NEXT_APP_URL: env.NEXT_APP_URL || 'NOT SET',
            USE_PREVIEW: env.USE_PREVIEW || 'false',
            PREVIEW_URL: env.PREVIEW_URL || 'NOT SET',
            ACTIVE_URL: targetUrl,
            hasRankingData: !!env.RANKING_DATA,
            hasWorkerAuthKey: !!env.WORKER_AUTH_KEY,
            hasVercelBypassSecret: !!env.VERCEL_PROTECTION_BYPASS_SECRET
          },
          features: {
            kvOptimizationEnabled: isKVOptimizationEnabled(env),
            fallbackToProxyEnabled: shouldFallbackToProxy(env),
            memoryCache: true,
            etagSupport: isKVOptimizationEnabled(env),
            directKVAccess: isKVOptimizationEnabled(env)
          },
          cacheInfo: {
            memoryCacheEntries: memoryCache.size,
            cacheTTL: CACHE_TTL
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // All other requests: use regular proxy with cache
      const cache = caches.default
      const baseUrl = env.USE_PREVIEW === 'true' && env.PREVIEW_URL 
        ? env.PREVIEW_URL 
        : env.NEXT_APP_URL
        
      if (!baseUrl) {
        return new Response('Target URL not configured', { status: 500 })
      }
      
      const targetUrl = `${baseUrl}${url.pathname}${url.search}`
      const cacheKey = new Request(targetUrl, request)
      
      // Check cache for non-API endpoints
      if (!url.pathname.startsWith('/api/')) {
        const cached = await cache.match(cacheKey)
        if (cached) {
          const secureResponse = applySecurityHeaders(cached)
          secureResponse.headers.set('X-CF-Cache', 'HIT')
          return secureResponse
        }
      }
      
      // Proxy to Vercel
      const response = await proxyToVercel(request, env)
      
      // Cache successful non-API responses
      if (response.ok && !url.pathname.startsWith('/api/')) {
        await cache.put(cacheKey, response.clone())
      }
      
      const secureResponse = applySecurityHeaders(response)
      secureResponse.headers.set('X-CF-Cache', 'MISS')
      
      return secureResponse
    } catch (error) {
      console.error('[HYBRID] Worker error:', error)
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        mode: 'HYBRID'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
}