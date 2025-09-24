/**
 * Tag Autocomplete Worker - Simplified version using existing KV data
 * 既存のRANKING_GROUP_1〜3から人気タグを取得
 */

export interface Env {
  RANKING_DATA: KVNamespace
}

function createCORSHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'public, max-age=300, s-maxage=3600'
  }
}

/**
 * KVから人気タグを取得
 */
async function getPopularTagsFromKV(
  env: Env,
  genre: string,
  period: '24h' | 'hour'
): Promise<string[]> {
  const groupKeys = ['RANKING_GROUP_1', 'RANKING_GROUP_2', 'RANKING_GROUP_3']

  for (const keyName of groupKeys) {
    try {
      const dataBuffer = await env.RANKING_DATA.get(keyName, 'arrayBuffer')
      if (!dataBuffer) continue

      let data: any

      // Check if data is gzipped (starts with 0x1f 0x8b)
      const view = new Uint8Array(dataBuffer)
      if (view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b) {
        // Data is gzipped, decompress it
        try {
          const stream = new Response(dataBuffer).body
          if (!stream) continue

          const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
          const decompressedResponse = new Response(decompressedStream)
          const text = await decompressedResponse.text()
          data = JSON.parse(text)
        } catch (e) {
          console.error(`Failed to decompress ${keyName}:`, e)
          // Try as plain text
          const text = new TextDecoder().decode(dataBuffer)
          data = JSON.parse(text)
        }
      } else {
        // Not gzipped, parse as text
        const text = new TextDecoder().decode(dataBuffer)
        data = JSON.parse(text)
      }

      // Extract popular tags
      const genreData = data.genres?.[genre]?.[period]
      if (genreData?.popularTags && genreData.popularTags.length > 0) {
        console.log(`Found ${genreData.popularTags.length} tags for ${genre}/${period}`)
        return genreData.popularTags
      }
    } catch (error) {
      console.error(`Error reading ${keyName}:`, error)
    }
  }

  return []
}

/**
 * Simple string matching for autocomplete
 */
function filterTags(tags: string[], query: string): string[] {
  const normalizedQuery = query.toLowerCase().trim()

  return tags
    .filter(tag => {
      const normalizedTag = tag.toLowerCase()
      return normalizedTag.includes(normalizedQuery)
    })
    .sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()

      // Exact match first
      if (aLower === normalizedQuery) return -1
      if (bLower === normalizedQuery) return 1

      // Starts with query
      const aStarts = aLower.startsWith(normalizedQuery)
      const bStarts = bLower.startsWith(normalizedQuery)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      // Alphabetical
      return a.localeCompare(b)
    })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // OPTIONS request handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createCORSHeaders()
      })
    }

    // Query parameters
    const query = url.searchParams.get('q') || ''
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50)
    const genre = url.searchParams.get('genre') || 'all'
    const period = (url.searchParams.get('period') || '24h') as '24h' | 'hour'

    // Minimum query length
    if (query.length < 2) {
      return new Response(JSON.stringify({
        suggestions: [],
        query,
        message: 'Query too short (minimum 2 characters)'
      }), {
        status: 200,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }

    try {
      // Get popular tags from KV
      const allTags = await getPopularTagsFromKV(env, genre, period)

      // Filter and sort tags
      const filteredTags = filterTags(allTags, query)
        .slice(0, limit)

      return new Response(JSON.stringify({
        suggestions: filteredTags,
        query,
        genre,
        period,
        total: filteredTags.length
      }), {
        status: 200,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json',
          'X-Data-Source': 'kv-ranking-data'
        }
      })
    } catch (error) {
      console.error('[Tag Autocomplete] Error:', error)
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          ...createCORSHeaders(),
          'Content-Type': 'application/json'
        }
      })
    }
  }
}