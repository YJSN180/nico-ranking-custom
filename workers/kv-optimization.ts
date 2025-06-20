import type { RankingGenre } from '../types/ranking-config'

// Genre to group mapping
const GENRE_TO_GROUP: Record<string, number> = {
  // Group 1
  'all': 1,
  'game': 1,
  'anime': 1,
  'vocaloid': 1,
  'voicesynthesis': 1,
  'entertainment': 1,
  'music': 1,
  'sing': 1,
  // Group 2
  'dance': 2,
  'play': 2,
  'commentary': 2,
  'cooking': 2,
  'travel': 2,
  'nature': 2,
  'vehicle': 2,
  'technology': 2,
  // Group 3
  'society': 3,
  'mmd': 3,
  'vtuber': 3,
  'radio': 3,
  'sports': 3,
  'animal': 3,
  'other': 3
}

/**
 * Get the group ID for a given genre
 */
export function getGroupIdForGenre(genre: RankingGenre | string): number {
  return GENRE_TO_GROUP[genre] || 1
}

/**
 * Extract specific genre and period data from compressed group data
 */
export async function extractGenreData(
  compressedData: Uint8Array,
  genre: string,
  period: string
): Promise<{
  items: any[]
  popularTags: string[]
  metadata?: any
}> {
  try {
    // Check if data is gzipped
    const isGzipped = compressedData[0] === 0x1f && compressedData[1] === 0x8b
    
    let jsonString: string
    if (isGzipped) {
      // Dynamic import for pako only when needed
      const pako = await import('pako')
      jsonString = pako.ungzip(compressedData, { to: 'string' })
    } else {
      // Not compressed, parse directly
      jsonString = new TextDecoder().decode(compressedData)
    }
    
    const data = JSON.parse(jsonString)
    
    // Extract specific genre/period data
    const genreData = data.genres?.[genre]?.[period]
    
    return {
      items: genreData?.items || [],
      popularTags: genreData?.popularTags || [],
      metadata: data.metadata
    }
  } catch (error) {
    // Return empty data on error
    return {
      items: [],
      popularTags: []
    }
  }
}

/**
 * Get cached response from Cloudflare Cache API
 */
export async function getCachedResponse(
  cacheKey: string,
  getter: () => Promise<Response>
): Promise<Response> {
  const cache = caches.default
  
  // Check cache
  const cachedResponse = await cache.match(cacheKey)
  if (cachedResponse) {
    return cachedResponse
  }
  
  // Get fresh response
  const response = await getter()
  
  // Cache successful responses only
  if (response.ok) {
    // Clone response before caching (response body can only be read once)
    await cache.put(cacheKey, response.clone())
  }
  
  return response
}