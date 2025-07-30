// Client-side ranking data cache with memory management
import type { RankingItem } from '@/types/ranking'

interface CacheEntry {
  data: RankingItem[]
  popularTags?: string[]
  timestamp: number
  size: number // Approximate size in bytes
}

import { CACHE_DURATIONS } from './cache-durations'

const CACHE_TTL = CACHE_DURATIONS.CLIENT_CACHE * 1000 // 20 minutes (fresher data for better UX)
const MAX_CACHE_SIZE = 50 * 1024 * 1024 // 50MB max cache size
const MAX_ENTRIES = 100 // Maximum number of cache entries

class RankingCache {
  private cache = new Map<string, CacheEntry>()
  private totalSize = 0
  private accessOrder: string[] = [] // LRU tracking

  private getCacheKey(genre: string, period: string, tag?: string): string {
    return `${genre}-${period}${tag ? `-tag-${tag}` : ''}`
  }

  private estimateSize(data: RankingItem[], popularTags?: string[]): number {
    // Rough estimation: ~500 bytes per item + tags
    const itemsSize = data.length * 500
    const tagsSize = popularTags ? popularTags.length * 50 : 0
    return itemsSize + tagsSize
  }

  private evictOldest() {
    while (
      (this.totalSize > MAX_CACHE_SIZE || this.cache.size > MAX_ENTRIES) && 
      this.accessOrder.length > 0
    ) {
      const oldestKey = this.accessOrder.shift()!
      const entry = this.cache.get(oldestKey)
      if (entry) {
        this.totalSize -= entry.size
        this.cache.delete(oldestKey)
      }
    }
  }

  private updateAccessOrder(key: string) {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(key)
  }

  get(genre: string, period: string, tag?: string): { data: RankingItem[], popularTags?: string[] } | null {
    const key = this.getCacheKey(genre, period, tag)
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }
    
    // Check if cache is still valid
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(key)
      this.totalSize -= entry.size
      const index = this.accessOrder.indexOf(key)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      return null
    }
    
    // Update access order for LRU
    this.updateAccessOrder(key)
    
    return {
      data: entry.data,
      popularTags: entry.popularTags
    }
  }

  set(genre: string, period: string, data: RankingItem[], popularTags?: string[], tag?: string) {
    // 空データのキャッシュを防ぐバリデーション
    if (!data || data.length === 0) {
      console.warn('[RankingCache] Attempted to cache empty data, skipping', { genre, period, tag })
      return
    }
    
    const key = this.getCacheKey(genre, period, tag)
    const size = this.estimateSize(data, popularTags)
    
    // Remove old entry if exists
    const oldEntry = this.cache.get(key)
    if (oldEntry) {
      this.totalSize -= oldEntry.size
    }
    
    // Add new size
    this.totalSize += size
    
    // Evict old entries if needed
    this.evictOldest()
    
    // Store new entry
    this.cache.set(key, {
      data,
      popularTags,
      timestamp: Date.now(),
      size
    })
    
    // Update access order
    this.updateAccessOrder(key)
  }

  clear() {
    this.cache.clear()
    this.totalSize = 0
    this.accessOrder = []
  }

  // Get cache stats for debugging
  getStats() {
    return {
      entries: this.cache.size,
      totalSize: this.totalSize,
      totalSizeMB: (this.totalSize / 1024 / 1024).toFixed(2)
    }
  }
}

// Singleton instance
export const rankingCache = new RankingCache()