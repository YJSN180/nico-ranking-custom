import type { RankingGenre } from '../types/ranking-config'

// Genre to group mapping (6グループ分散 - getthumbinfo APIレート制限対策)
const GENRE_TO_GROUP: Record<string, number> = {
  // Group 1
  'all': 1,
  'game': 1,
  'anime': 1,
  'vocaloid': 1,
  // Group 2
  'voicesynthesis': 2,
  'entertainment': 2,
  'music': 2,
  'sing': 2,
  // Group 3
  'dance': 3,
  'play': 3,
  'commentary': 3,
  'cooking': 3,
  // Group 4
  'travel': 4,
  'nature': 4,
  'vehicle': 4,
  'technology': 4,
  // Group 5
  'society': 5,
  'mmd': 5,
  'vtuber': 5,
  'radio': 5,
  // Group 6
  'sports': 6,
  'animal': 6,
  'other': 6
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
    // 統一圧縮ライブラリを使用して解凍
    const { decompressAndParseJSON } = await import('../lib/unified-compression')
    const decompressedResult = await decompressAndParseJSON(compressedData)
    const data = decompressedResult.data
    
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
  const cache = (caches as any).default
  
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