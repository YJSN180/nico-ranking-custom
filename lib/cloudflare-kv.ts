// Cloudflare KV integration for ranking data storage
// This module handles reading and writing compressed ranking data to Cloudflare KV

// Dynamic import for Edge runtime compatibility
let pako: any

// KV namespace binding (will be injected by Cloudflare Workers)
declare global {
  const RANKING_KV: KVNamespace | undefined
}

// Mock KVNamespace for type checking
interface KVNamespace {
  get(key: string): Promise<string | null>
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
  metadata: {
    version: number
    updatedAt: string
    totalItems: number
  }
}

// Single key for all ranking data
const RANKING_DATA_KEY = 'ranking-data-bundle'

/**
 * Compress data using gzip
 */
export async function compressData(data: any): Promise<Uint8Array> {
  if (!pako) {
    pako = await import('pako')
  }
  const jsonString = JSON.stringify(data)
  return pako.gzip(jsonString)
}

/**
 * Decompress gzipped data
 */
export async function decompressData(compressed: Uint8Array): Promise<any> {
  if (!pako) {
    pako = await import('pako')
  }
  const jsonString = pako.ungzip(compressed, { to: 'string' })
  return JSON.parse(jsonString)
}

/**
 * Write ranking data to Cloudflare KV (single write)
 */
export async function setRankingToKV(data: KVRankingData): Promise<void> {
  if (typeof RANKING_KV === 'undefined') {
    throw new Error('Cloudflare KV namespace not available')
  }

  // Compress the data
  const compressed = await compressData(data)
  
  // Store with metadata
  await RANKING_KV.put(RANKING_DATA_KEY, compressed as any, {
    metadata: {
      compressed: true,
      version: data.metadata.version,
      updatedAt: data.metadata.updatedAt
    }
  })
}

/**
 * Read ranking data from Cloudflare KV
 */
export async function getRankingFromKV(): Promise<KVRankingData | null> {
  if (typeof RANKING_KV === 'undefined') {
    throw new Error('Cloudflare KV namespace not available')
  }

  const result = await RANKING_KV.getWithMetadata<Uint8Array>(
    RANKING_DATA_KEY,
    { type: 'arrayBuffer' }
  )
  
  if (!result.value) {
    return null
  }

  // Decompress if needed
  if (result.metadata?.compressed) {
    return await decompressData(new Uint8Array(result.value))
  }

  // Fallback to uncompressed (shouldn't happen in production)
  return JSON.parse(new TextDecoder().decode(result.value))
}

/**
 * Get specific genre/period data from KV
 */
export async function getGenreRanking(
  genre: string,
  period: '24h' | 'hour'
): Promise<{ items: any[], popularTags: string[], tags?: { [tag: string]: any[] }, metadata?: any } | null> {
  const data = await getRankingFromKV()
  
  if (!data || !data.genres[genre]) {
    return null
  }

  const result = data.genres[genre][period]
  // Add metadata if available
  if (data.metadata) {
    return { ...result, metadata: data.metadata }
  }
  
  return result
}

/**
 * Get tag-specific ranking from KV
 */
export async function getTagRanking(
  genre: string,
  period: '24h' | 'hour',
  tag: string
): Promise<any[] | null> {
  const genreData = await getGenreRanking(genre, period)
  
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