// Cloudflare KV integration for ranking data storage
// This module handles reading and writing ranking data to Cloudflare KV

import { getGroupIdForGenre, GENRE_GROUPS } from '../types/ranking-config'
import { parseBufferAsJSON } from './unified-compression'

// KV namespace binding (will be injected by Cloudflare Workers)
declare global {
  const RANKING_KV: KVNamespace | undefined
}

// Mock KVNamespace for type checking
interface KVNamespace {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>
  getWithMetadata<T>(key: string, options?: any): Promise<{ value: T | null, metadata: any | null }>
  put(key: string, value: string | ArrayBuffer, options?: any): Promise<void>
}

export interface KVRankingData {
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
  derivativeNGData?: {
    blockedVideoIds: string[]
    blockedAuthorIds: string[]
    statsSnapshot: {
      totalVideosProcessed: number
      totalBlocked: number
      lastUpdated: string
    }
  }
}

// Single key for all ranking data (deprecated, kept for backward compatibility)
const RANKING_DATA_KEY = 'RANKING_LATEST'

// 3-key split keys
const RANKING_GROUP_KEYS = {
  1: 'RANKING_GROUP_1',
  2: 'RANKING_GROUP_2',
  3: 'RANKING_GROUP_3'
} as const

/**
 * Write ranking data to Cloudflare KV (deprecated - single key write)
 * New code should split data into 3 groups and write separately
 */
export async function setRankingToKV(data: KVRankingData): Promise<void> {
  if (typeof RANKING_KV === 'undefined') {
    throw new Error('Cloudflare KV namespace not available')
  }

  // Ensure metadata exists with default values
  const dataToStore = {
    ...data,
    metadata: {
      version: data.metadata?.version || 1,
      updatedAt: data.metadata?.updatedAt || new Date().toISOString(),
      totalItems: data.metadata?.totalItems || 0
    }
  }

  // Store JSON data directly without compression
  await RANKING_KV.put(RANKING_DATA_KEY, JSON.stringify(dataToStore), {
    metadata: {
      compressed: false,
      version: dataToStore.metadata.version,
      updatedAt: dataToStore.metadata.updatedAt
    }
  })
}

/**
 * Read ranking data from Cloudflare KV (supports both single-key and 3-key split)
 */
export async function getRankingFromKV(): Promise<KVRankingData | null> {
  // 3-key split structureのみ使用
  return getRankingFromKV3Keys()
}

/**
 * Read ranking data from 3-key split structure
 */
async function getRankingFromKV3Keys(): Promise<KVRankingData | null> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.KV_RANKING_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    return null
  }
  
  try {
    // Fetch all 3 groups in parallel
    const groupPromises = Object.entries(RANKING_GROUP_KEYS).map(async ([groupId, keyName]) => {
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${keyName}`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          // ${keyName} not found (404)
          return null
        }
        // Failed to read ${keyName}: ${response.status} ${response.statusText}
        // Try to get error details
        try {
          const errorText = await response.text()
          // Error details for ${keyName}: errorText
        } catch {}
        // Return null instead of throwing to allow partial reads
        return null
      }
      
      const data = await response.arrayBuffer()
      
      // Parse data using unified compression library
      return await parseBufferAsJSON<KVRankingData>(data)
    })
    
    const groupResults = await Promise.allSettled(groupPromises)
    
    // Extract successful results
    const successfulResults = groupResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => (result as PromiseFulfilledResult<KVRankingData | null>).value)
      .filter((value): value is KVRankingData => value !== null)
    
    // Log detailed errors for failed groups
    groupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        // Group ${index + 1} failed: result.reason
      } else if (result.status === 'fulfilled' && result.value === null) {
        // Group ${index + 1} returned null
      }
    })
    
    // If no groups were successfully read, return null
    if (successfulResults.length === 0) {
      // No groups could be read successfully
      return null
    }
    
    // Log warning if some groups failed
    if (successfulResults.length < 3) {
      // Only ${successfulResults.length}/3 groups were read successfully
    }
    
    // Merge all groups into single data structure
    const mergedData: KVRankingData = {
      genres: {},
      metadata: successfulResults[0]?.metadata // Use metadata from first successful group
    }
    
    // Merge genres from all successful groups
    for (const groupData of successfulResults) {
      if (groupData && groupData.genres) {
        Object.assign(mergedData.genres, groupData.genres)
      }
    }
    
    return mergedData
    
  } catch (error) {
    // Failed to read 3-key split data: error
    return null
  }
}

/**
 * Read ranking data from single key (backward compatibility)
 */
async function getRankingFromKVSingleKey(): Promise<KVRankingData | null> {
  // Worker環境の場合
  if (typeof RANKING_KV !== 'undefined') {
    const result = await RANKING_KV.get(RANKING_DATA_KEY, 'json')
    
    if (!result) {
      return null
    }

    return result as KVRankingData
  }
  
  // Node.js環境の場合はREST APIを使用
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.KV_RANKING_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    // Cloudflare KV credentials not configured - returning null
    return null
  }
  
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${RANKING_DATA_KEY}`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      // Log error but return null to allow graceful fallback
      console.error(`[KV] Cloudflare KV read failed: ${response.status}`)
      return null
    }
    
    const data = await response.arrayBuffer()
    const uint8Array = new Uint8Array(data)
    
    // console.log(`[KV] Data received: ${data.byteLength} bytes`)
    
    // Parse data using unified compression library
    return await parseBufferAsJSON(data)
  } catch (error) {
    // Failed to read from Cloudflare KV - returning null
    // Failed to read RANKING_LATEST: error
    return null
  }
}

/**
 * Get specific genre/period data from KV (optimized for 3-key split)
 */
export async function getGenreRanking(
  genre: string,
  period: '24h' | 'hour'
): Promise<{ items: any[], popularTags: string[], tags?: { [tag: string]: any[] }, metadata?: any } | null> {
  try {
    // For 3-key split, only fetch the specific group containing this genre
    const groupId = getGroupIdForGenre(genre as any)
    // Fetching genre '${genre}' from group ${groupId}
    
    const groupData = await getRankingGroupFromKV(groupId)
    
    if (!groupData || !groupData.genres || !groupData.genres[genre]) {
      // [KV] Genre not found in group, trying full data fetch
      // Fallback to fetching all data (backward compatibility)
      const data = await getRankingFromKV()
      if (!data || !data.genres || !data.genres[genre]) {
        // [KV] Genre not found in any data source
        return null
      }
      const result = data.genres[genre][period]
      if (data.metadata) {
        return { ...result, metadata: data.metadata }
      }
      return result
    }

    const result = groupData.genres[genre][period]
    if (!result) {
      // Period '${period}' not found for genre '${genre}'
      return null
    }
    
    // Add metadata if available
    if (groupData.metadata) {
      return { ...result, metadata: groupData.metadata }
    }
    
    return result
  } catch (error) {
    // Error in getGenreRanking for genre='${genre}', period='${period}': error
    return null
  }
}

/**
 * Read specific group from KV (optimized for single genre requests)
 */
async function getRankingGroupFromKV(groupId: 1 | 2 | 3): Promise<KVRankingData | null> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.KV_RANKING_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    return null
  }
  
  try {
    const keyName = RANKING_GROUP_KEYS[groupId]
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${keyName}`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        // ${keyName} not found (404)
        return null
      }
      // Failed to read ${keyName}: ${response.status}
      // Log response body for debugging
      try {
        const errorText = await response.text()
        // Error response: errorText
      } catch {}
      return null
    }
    
    const data = await response.arrayBuffer()
    
    // Parse data using unified compression library
    return await parseBufferAsJSON<KVRankingData>(data)
    
  } catch (error) {
    // Failed to read group ${groupId}: error
    return null
  }
}

/**
 * Get tag-specific ranking from KV
 */
export async function getTagRanking(
  genre: string,
  period: '24h' | 'hour',
  tag: string
): Promise<any[] | null> {
  // 単一キーから全データを取得
  const allData = await getRankingFromKV()
  if (!allData || !allData.genres) return null
  
  // 該当するタグデータを抽出
  const genreData = allData.genres[genre]?.[period]
  if (!genreData || !genreData.tags || !genreData.tags[tag]) {
    return null
  }
  
  return genreData.tags[tag]
}

/**
 * Initialize KV with empty data (for testing)
 */
export async function initializeKV(): Promise<void> {
  const emptyData: KVRankingData = {
    genres: {},
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalItems: 0
    }
  }

  await setRankingToKV(emptyData)
}

/**
 * Get KV stats (for monitoring)
 */
export async function getKVStats(): Promise<{
  lastUpdated: string | null
  version: number | null
  hasData: boolean
}> {
  if (typeof RANKING_KV === 'undefined') {
    return { lastUpdated: null, version: null, hasData: false }
  }

  const result = await RANKING_KV.getWithMetadata(RANKING_DATA_KEY)
  
  if (!result.value) {
    return { lastUpdated: null, version: null, hasData: false }
  }

  return {
    lastUpdated: result.metadata?.updatedAt || null,
    version: result.metadata?.version || null,
    hasData: true
  }
}