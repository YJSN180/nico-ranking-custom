/**
 * Cloudflare KV utilities for Workers environment
 * Optimized for direct KV binding usage
 */

// Type declaration for Workers environment
declare global {
  interface KVNamespace {
    get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<any>
    getWithMetadata<T>(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<{ value: T | null; metadata: any }>
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: any): Promise<void>
    delete(key: string): Promise<void>
    list(options?: any): Promise<any>
  }
}

import { parseBufferAsJSON } from './unified-compression'

/**
 * Decompress gzipped data in Workers environment
 * Uses unified compression library for consistency
 */
export async function decompressData(compressed: Uint8Array): Promise<any> {
  try {
    // Convert Uint8Array to ArrayBuffer properly
    const buffer = compressed.buffer instanceof ArrayBuffer 
      ? compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)
      : compressed.slice().buffer
    const result = await parseBufferAsJSON(buffer)
    return result
  } catch (error) {
    console.error('[UnifiedCompression] Decompression failed:', error)
    throw new Error(`Decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Compress data using Web API CompressionStream
 * Used for storing data in KV
 */
export async function compressData(data: any): Promise<Uint8Array> {
  try {
    const jsonString = JSON.stringify(data)
    const encoder = new TextEncoder()
    const input = encoder.encode(jsonString)
    
    const stream = new CompressionStream('gzip')
    const writer = stream.writable.getWriter()
    writer.write(input)
    writer.close()
    
    const compressed = await new Response(stream.readable).arrayBuffer()
    return new Uint8Array(compressed)
  } catch (error) {
    console.error('Workers compression failed:', error)
    throw new Error(`Compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get genre ranking from KV binding
 */
export async function getGenreRankingFromBinding(
  kv: KVNamespace,
  genre: string,
  period: '24h' | 'hour'
): Promise<{ items: any[], popularTags: string[], metadata?: any } | null> {
  try {
    const result = await kv.getWithMetadata<Uint8Array>(
      'RANKING_LATEST',
      { type: 'arrayBuffer' }
    )
    
    if (!result.value) {
      return null
    }

    const allData = await decompressData(new Uint8Array(result.value))
    
    if (!allData || !allData.genres || !allData.genres[genre]) {
      return null
    }

    const genreData = allData.genres[genre][period]
    if (allData.metadata) {
      return { ...genreData, metadata: allData.metadata }
    }
    
    return genreData
  } catch (error) {
    console.error(`Failed to get genre ranking ${genre}-${period}:`, error)
    return null
  }
}

/**
 * Get tag ranking from KV binding
 */
export async function getTagRankingFromBinding(
  kv: KVNamespace,
  genre: string,
  period: '24h' | 'hour',
  tag: string
): Promise<any[] | null> {
  try {
    const result = await kv.getWithMetadata<Uint8Array>(
      'RANKING_LATEST',
      { type: 'arrayBuffer' }
    )
    
    if (!result.value) {
      return null
    }

    const allData = await decompressData(new Uint8Array(result.value))
    
    if (!allData || !allData.genres) {
      return null
    }
    
    const genreData = allData.genres[genre]?.[period]
    if (!genreData || !genreData.tags || !genreData.tags[tag]) {
      return null
    }
    
    return genreData.tags[tag]
  } catch (error) {
    console.error(`Failed to get tag ranking ${genre}-${period}-${tag}:`, error)
    return null
  }
}

/**
 * Get video stats from KV binding
 */
export async function getVideoStatsFromBinding(
  kv: KVNamespace,
  videoIds: string[]
): Promise<Record<string, any>> {
  if (videoIds.length === 0) {
    return {}
  }

  try {
    const result = await kv.getWithMetadata<Uint8Array>(
      'VIDEO_STATS_LATEST',
      { type: 'arrayBuffer' }
    )
    
    if (!result.value) {
      return {}
    }

    const statsData = await decompressData(new Uint8Array(result.value))
    
    // Extract only requested video IDs
    const stats: Record<string, any> = {}
    for (const id of videoIds) {
      if (statsData.stats && statsData.stats[id]) {
        stats[id] = statsData.stats[id]
      }
    }
    
    return stats
  } catch (error) {
    console.error('Failed to get video stats from KV binding:', error)
    return {}
  }
}