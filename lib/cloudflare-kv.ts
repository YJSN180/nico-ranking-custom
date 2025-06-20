// Cloudflare KV integration for ranking data storage
// This module handles reading and writing ranking data to Cloudflare KV

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

// Single key for all ranking data
const RANKING_DATA_KEY = 'RANKING_LATEST'

/**
 * Write ranking data to Cloudflare KV (single write)
 */
export async function setRankingToKV(data: KVRankingData): Promise<void> {
  if (typeof RANKING_KV === 'undefined') {
    throw new Error('Cloudflare KV namespace not available')
  }

  // Store JSON data directly without compression
  await RANKING_KV.put(RANKING_DATA_KEY, JSON.stringify(data), {
    metadata: {
      compressed: false,
      version: data.metadata?.version || 1,
      updatedAt: data.metadata?.updatedAt || new Date().toISOString()
    }
  })
}

/**
 * Read ranking data from Cloudflare KV
 */
export async function getRankingFromKV(): Promise<KVRankingData | null> {
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
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
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
      throw new Error(`Cloudflare KV read failed: ${response.status}`)
    }
    
    const data = await response.arrayBuffer()
    const uint8Array = new Uint8Array(data)
    
    // console.log(`[KV] Data received: ${data.byteLength} bytes`)
    
    // 非圧縮JSONデータとして処理
    const jsonString = new TextDecoder().decode(uint8Array)
    return JSON.parse(jsonString)
  } catch (error) {
    // Failed to read from Cloudflare KV - returning null
    console.error('[KV] Failed to read RANKING_LATEST:', error)
    return null
  }
}

/**
 * Get specific genre/period data from KV
 */
export async function getGenreRanking(
  genre: string,
  period: '24h' | 'hour'
): Promise<{ items: any[], popularTags: string[], tags?: { [tag: string]: any[] }, metadata?: any } | null> {
  const data = await getRankingFromKV()
  
  if (!data || !data.genres || !data.genres[genre]) {
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