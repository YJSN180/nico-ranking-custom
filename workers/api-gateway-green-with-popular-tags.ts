/**
 * Green Worker with Popular Tags Integration
 * Extends the existing Green Worker with popular-tags endpoint
 */

export interface Env {
  RANKING_DATA: KVNamespace
  RATE_LIMITER?: any
  R2_BUCKET?: R2Bucket
  VERCEL_DEPLOYMENT_URL?: string
  WORKER_AUTH_KEY?: string
}

interface KVRankingData {
  genres: {
    [genre: string]: {
      '24h': {
        items: any[]
        popularTags: string[]
        tags?: { [tag: string]: any[] }
      }
      hour: {
        items: any[]
        popularTags: string[]
        tags?: { [tag: string]: any[] }
      }
    }
  }
  timestamp?: string
  version?: number
  metadata?: {
    version: number
    updatedAt: string
    totalItems: number
  }
}

// Import existing Green Worker
import greenWorker from './api-gateway-green-20250726.js'

// 3-key split keys for optimized data access
const RANKING_GROUP_KEYS = {
  1: 'RANKING_GROUP_1',
  2: 'RANKING_GROUP_2',
  3: 'RANKING_GROUP_3'
} as const

// Genre to group mapping for efficient KV access
const GENRE_GROUP_MAP: Record<string, 1 | 2 | 3> = {
  'all': 1,
  'game': 1,
  'anime': 1,
  'music': 2,
  'sing': 2,
  'dance': 2,
  'play': 2,
  'vocaloid': 2,
  'nicoindies': 2,
  'entertainment': 3,
  'radio': 3,
  'draw': 3,
  'technology': 3,
  'handcraft': 3,
  'make': 3,
  'politics': 3,
  'science': 3,
  'history': 3,
  'nature': 3,
  'cooking': 3,
  'travel': 3,
  'sports': 3,
  'lecture': 3,
  'animal': 3,
  'voicesynthesis': 3,
  'other': 3
}

function getGroupIdForGenre(genre: string): 1 | 2 | 3 {
  return GENRE_GROUP_MAP[genre] || 3
}

async function getPopularTagsFromKV(
  env: Env,
  genre: string,
  period: '24h' | 'hour'
): Promise<{ tags: string[], source: 'kv' | 'fallback' } | null> {
  try {
    // For 'all' genre, aggregate from multiple genres
    if (genre === 'all') {
      const genres = ['game', 'anime', 'entertainment', 'technology', 'voicesynthesis', 'vocaloid', 'music']
      const tagCountMap = new Map<string, number>()

      console.log(`Aggregating tags for 'all' from genres: ${genres.join(', ')}`)

      for (const g of genres) {
        const result = await getGenreTagsFromKV(env, g, period)
        if (result && result.tags) {
          console.log(`  Got ${result.tags.length} tags from ${g}`)
          result.tags.forEach((tag, index) => {
            const score = result.tags.length - index
            tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + score)
          })
        } else {
          console.log(`  No tags from ${g}`)
        }
      }

      const sortedTags = Array.from(tagCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([tag]) => tag)

      console.log(`Aggregated ${sortedTags.length} tags for 'all'`)
      return { tags: sortedTags, source: 'kv' }
    }

    // For specific genre, get from appropriate KV group
    const result = await getGenreTagsFromKV(env, genre, period)
    if (result) {
      return result
    }

    return null
  } catch (error) {
    console.error('Error fetching from KV:', error)
    return null
  }
}

async function getGenreTagsFromKV(
  env: Env,
  genre: string,
  period: '24h' | 'hour'
): Promise<{ tags: string[], source: 'kv' } | null> {
  const groupId = getGroupIdForGenre(genre)
  const keyName = RANKING_GROUP_KEYS[groupId]

  try {
    // First try to get as arrayBuffer to check if compressed
    const dataBuffer = await env.RANKING_DATA.get(keyName, 'arrayBuffer')
    if (!dataBuffer) {
      console.log(`No data found for ${keyName}`)
      return null
    }

    let data: KVRankingData

    // Check if data is gzipped (starts with 0x1f 0x8b)
    const view = new Uint8Array(dataBuffer)
    if (view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b) {
      // Data is gzipped, use DecompressionStream
      try {
        const stream = new Response(dataBuffer).body
        if (!stream) throw new Error('No stream')

        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
        const decompressedResponse = new Response(decompressedStream)
        const text = await decompressedResponse.text()
        data = JSON.parse(text)
      } catch (e) {
        console.error(`Failed to decompress gzipped data for ${keyName}:`, e)
        // Try as plain text as fallback
        const text = new TextDecoder().decode(dataBuffer)
        data = JSON.parse(text)
      }
    } else {
      // Not gzipped, parse as text
      const text = new TextDecoder().decode(dataBuffer)
      data = JSON.parse(text)
    }

    const genreData = data.genres?.[genre]?.[period]

    if (genreData?.popularTags && genreData.popularTags.length > 0) {
      console.log(`Found ${genreData.popularTags.length} popular tags for ${genre}/${period}`)
      return { tags: genreData.popularTags, source: 'kv' }
    }

    console.log(`No popular tags found for ${genre}/${period} in ${keyName}`)
    return null
  } catch (error) {
    console.error(`Error reading ${keyName}:`, error)
    return null
  }
}

function generateETag(data: any): string {
  // Use TextEncoder to handle Unicode characters properly
  const encoder = new TextEncoder()
  const dataBytes = encoder.encode(JSON.stringify(data))

  // Simple hash function for ETag
  let hash = 0
  for (let i = 0; i < dataBytes.length; i++) {
    hash = ((hash << 5) - hash) + dataBytes[i]
    hash = hash & hash // Convert to 32-bit integer
  }

  return `W/"${Math.abs(hash).toString(16)}"`
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false

  try {
    const url = new URL(origin)
    const hostname = url.hostname

    // Allow production domain
    if (hostname === 'nico-rank.com') {
      return true
    }

    // Allow Vercel preview deployments
    if (hostname.endsWith('.vercel.app')) {
      if (hostname.includes('nico-ranking-custom') && hostname.includes('yjsns-projects')) {
        return true
      }
    }

    // Allow local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true
    }

    return false
  } catch (error) {
    return false
  }
}

function createSecureCORSHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : 'https://nico-rank.com'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Max-Age': '86400'
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    // Handle OPTIONS requests for CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createSecureCORSHeaders(origin)
      })
    }

    // Handle popular-tags endpoint
    if (url.pathname === '/api/popular-tags') {
      try {
        console.log('[Green Worker] Handling popular-tags endpoint')

        // Parse query parameters
        const genre = url.searchParams.get('genre') || 'all'
        const period = (url.searchParams.get('period') || '24h') as '24h' | 'hour'
        const page = parseInt(url.searchParams.get('page') || '1', 10)
        const limit = parseInt(url.searchParams.get('limit') || '50', 10)

        console.log(`Request: genre=${genre}, period=${period}, page=${page}, limit=${limit}`)

        // Get tags from KV or fallback
        const result = await getPopularTagsFromKV(env, genre, period) || {
          tags: [],
          source: 'fallback' as const
        }

        console.log(`Got ${result.tags.length} tags from source: ${result.source}`)

        // Apply pagination
        const start = (page - 1) * limit
        const paginatedTags = result.tags.slice(start, start + limit)

        // Prepare response data
        const responseData = {
          tags: paginatedTags,
          total: result.tags.length,
          page,
          limit,
          genre,
          period
        }

        // Generate ETag
        const etag = generateETag(responseData)

        // Check If-None-Match header
        const ifNoneMatch = request.headers.get('if-none-match')
        if (ifNoneMatch === etag) {
          return new Response(null, {
            status: 304,
            headers: {
              ...createSecureCORSHeaders(origin),
              'etag': etag,
              'cache-control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
              'X-Worker-Version': 'green-with-popular-tags'
            }
          })
        }

        // Return JSON response
        return new Response(JSON.stringify(responseData), {
          status: 200,
          headers: {
            ...createSecureCORSHeaders(origin),
            'content-type': 'application/json',
            'cache-control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
            'etag': etag,
            'x-data-source': result.source,
            'X-Worker-Version': 'green-with-popular-tags'
          }
        })
      } catch (error) {
        console.error('Error in popular-tags endpoint:', error)
        return new Response(JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: {
            ...createSecureCORSHeaders(origin),
            'content-type': 'application/json'
          }
        })
      }
    }

    // For all other requests, delegate to the original Green Worker
    return greenWorker.fetch(request, env, ctx)
  }
}