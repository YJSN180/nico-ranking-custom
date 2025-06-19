/**
 * Cloudflare Workers API Gateway - KV Optimized Version
 * KVバインディングを直接使用してKV読み取り回数を大幅削減
 * 圧縮なしのJSON形式でデータを直接読み取り
 */

// Import crypto for ETag generation
const crypto = globalThis.crypto

export interface Env {
  RANKING_DATA: KVNamespace
  NEXT_APP_URL: string
  USE_PREVIEW?: string
  PREVIEW_URL?: string
  VERCEL_PROTECTION_BYPASS_SECRET?: string
  WORKER_AUTH_KEY?: string
}

// Cache for data
const memoryCache = new Map<string, { data: any; timestamp: number; etag: string }>()
const CACHE_TTL = 60 * 1000 // 1 minute

// Generate ETag for content
async function generateETag(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `"${hashHex.substring(0, 16)}"`
}

// Get ranking data directly from KV binding
async function getRankingDataFromKV(env: Env, bypassCache = false): Promise<any> {
  const cacheKey = 'RANKING_LATEST'
  const now = Date.now()
  
  // Check memory cache (unless bypassed)
  if (!bypassCache) {
    const cached = memoryCache.get(cacheKey)
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      return { data: cached.data, etag: cached.etag }
    }
  }
  
  try {
    const result = await env.RANKING_DATA.getWithMetadata(
      'RANKING_LATEST',
      { type: 'json' }
    )
    
    if (!result.value) {
      return { data: null, etag: null }
    }

    // Data is now stored uncompressed as JSON
    const data = result.value
    
    // Generate ETag
    const etag = await generateETag(JSON.stringify(data))
    
    // Update memory cache
    memoryCache.set(cacheKey, { data, timestamp: now, etag })
    
    return { data, etag }
  } catch (error) {
    console.error('[KV-OPT] Failed to read RANKING_LATEST:', error)
    console.error('[KV-OPT] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error  // Re-throw to let handleRankingAPI handle it
  }
}

// Get video stats directly from KV binding
async function getVideoStatsFromKV(env: Env, bypassCache = false): Promise<any> {
  const cacheKey = 'VIDEO_STATS_LATEST'
  const now = Date.now()
  
  // Check memory cache (unless bypassed)
  if (!bypassCache) {
    const cached = memoryCache.get(cacheKey)
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      return { data: cached.data, etag: cached.etag }
    }
  }
  
  try {
    const result = await env.RANKING_DATA.getWithMetadata(
      'VIDEO_STATS_LATEST',
      { type: 'json' }
    )
    
    if (!result.value) {
      return { data: null, etag: null }
    }

    // Data is now stored uncompressed as JSON
    const data = result.value
    
    // Generate ETag
    const etag = await generateETag(JSON.stringify(data))
    
    // Update memory cache
    memoryCache.set(cacheKey, { data, timestamp: now, etag })
    
    return { data, etag }
  } catch (error) {
    console.error('[KV-OPT] Failed to read VIDEO_STATS_LATEST:', error)
    throw error  // Re-throw to let handleVideoStatsAPI handle it
  }
}

// Handle ranking API requests
async function handleRankingAPI(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const genre = url.searchParams.get('genre') || 'all'
  const period = url.searchParams.get('period') || '24h'
  const tag = url.searchParams.get('tag')
  
  // Check for cache bypass header (for testing)
  const bypassCache = request.headers.get('X-Bypass-Cache') === 'true'
  
  // Validate period
  if (!['24h', 'hour'].includes(period)) {
    return new Response(JSON.stringify({ error: 'Invalid period' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  try {
    const { data: allData, etag } = await getRankingDataFromKV(env, bypassCache)
    
    if (!allData || !allData.genres) {
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
    
    const response = new Response(JSON.stringify(responseData), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
        'ETag': etag || '',
        'X-Cache-Status': 'KV-OPTIMIZED',
        'X-API-Version': 'kv-optimized-uncompressed'
      }
    })
    
    return response
  } catch (error) {
    console.error('[KV-OPT] Ranking API error:', error)
    // Return 500 for actual errors (KV failures, etc.)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: errorMessage,
      mode: 'KV_OPTIMIZED'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Handle video stats API requests
async function handleVideoStatsAPI(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const videoIds = url.searchParams.get('ids')?.split(',').filter(Boolean) || []
  
  if (videoIds.length === 0) {
    return new Response(JSON.stringify({ error: 'No video IDs provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  if (videoIds.length > 500) {
    return new Response(JSON.stringify({ error: 'Too many video IDs (max 500)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  try {
    // Check for cache bypass header (for testing)
    const bypassCache = request.headers.get('X-Bypass-Cache') === 'true'
    const { data: statsData, etag } = await getVideoStatsFromKV(env, bypassCache)
    
    if (!statsData || !statsData.stats) {
      return new Response(JSON.stringify({ stats: {}, timestamp: new Date().toISOString(), count: 0, kvHitRate: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Check conditional request
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304 })
    }
    
    // Extract requested video stats
    const requestedStats: any = {}
    let hitCount = 0
    
    for (const videoId of videoIds) {
      if (statsData.stats[videoId]) {
        requestedStats[videoId] = statsData.stats[videoId]
        hitCount++
      }
    }
    
    const response = {
      stats: requestedStats,
      timestamp: new Date().toISOString(),
      count: hitCount,
      kvHitRate: videoIds.length > 0 ? hitCount / videoIds.length : 0
    }
    
    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=180, max-age=60, stale-while-revalidate=120',
        'ETag': etag || '',
        'X-Cache-Status': 'KV-OPTIMIZED',
        'X-KV-Hit-Rate': response.kvHitRate.toString()
      }
    })
  } catch (error) {
    console.error('[KV-OPT] Video stats API error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
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

// Export for testing purposes
// Export function to clear memory cache (for testing)
export function clearMemoryCache() {
  memoryCache.clear()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      
      // Handle KV-optimized API endpoints
      if (url.pathname === '/api/edge/ranking') {
        const response = await handleRankingAPI(request, env)
        return applySecurityHeaders(response)
      }
      
      if (url.pathname === '/api/edge/video-stats') {
        const response = await handleVideoStatsAPI(request, env)
        return applySecurityHeaders(response)
      }
      
      // Debug endpoint
      if (url.pathname === '/debug') {
        const targetUrl = env.USE_PREVIEW === 'true' && env.PREVIEW_URL 
          ? env.PREVIEW_URL 
          : env.NEXT_APP_URL
          
        return new Response(JSON.stringify({
          mode: 'KV_OPTIMIZED_UNCOMPRESSED',
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
            kvOptimized: true,
            memoryCache: true,
            etagSupport: true,
            directKVAccess: true,
            compression: false
          },
          cacheInfo: {
            memoryCacheEntries: memoryCache.size,
            cacheTTL: CACHE_TTL
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // Fallback to original proxy behavior for all other requests
      const baseUrl = env.USE_PREVIEW === 'true' && env.PREVIEW_URL 
        ? env.PREVIEW_URL 
        : env.NEXT_APP_URL
        
      if (!baseUrl) {
        return new Response('Target URL not configured', { 
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        })
      }
      
      const targetUrl = `${baseUrl}${url.pathname}${url.search}`
      
      // Cache API for other endpoints
      const cache = caches.default
      const cacheKey = new Request(targetUrl, request)
      
      // Check cache for non-optimized endpoints
      let response = await cache.match(cacheKey)
      if (response) {
        const secureResponse = applySecurityHeaders(response)
        secureResponse.headers.set('X-CF-Cache', 'HIT')
        return secureResponse
      }
      
      // Add authentication headers and proxy
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
      
      response = await fetch(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
      })
      
      // Cache successful responses
      if (response.ok) {
        await cache.put(cacheKey, response.clone())
      }
      
      const secureResponse = applySecurityHeaders(response)
      secureResponse.headers.set('X-CF-Cache', 'MISS')
      
      return secureResponse
    } catch (error) {
      console.error('[KV-OPT] Worker error:', error)
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        mode: 'KV_OPTIMIZED_UNCOMPRESSED'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
}