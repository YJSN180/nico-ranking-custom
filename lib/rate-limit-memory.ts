/**
 * Memory-based rate limiting with periodic KV sync
 * This reduces KV write frequency to prevent 429 errors
 */

import { kv } from './simple-kv'

interface RateLimitEntry {
  count: number
  resetAt: number
  lastSynced?: number
}

class MemoryRateLimitImpl {
  private static instance: MemoryRateLimitImpl
  private memoryStore: Map<string, RateLimitEntry> = new Map()
  private syncInterval: NodeJS.Timeout | null = null
  private readonly SYNC_INTERVAL = 5000 // Sync every 5 seconds
  private readonly MAX_ENTRIES = 10000 // Prevent memory leak
  
  private constructor() {
    // Start periodic sync if in production
    if (process.env.NODE_ENV === 'production') {
      this.startPeriodicSync()
    }
  }
  
  static getInstance(): MemoryRateLimitImpl {
    if (!MemoryRateLimitImpl.instance) {
      MemoryRateLimitImpl.instance = new MemoryRateLimitImpl()
    }
    return MemoryRateLimitImpl.instance
  }
  
  private startPeriodicSync() {
    this.syncInterval = setInterval(() => {
      this.syncToKV().catch(error => {
        console.error('[RATE_LIMIT] Sync failed:', error)
      })
    }, this.SYNC_INTERVAL)
  }
  
  private async syncToKV() {
    const now = Date.now()
    const entriesToSync: Array<[string, RateLimitEntry]> = []
    
    // Collect entries that need syncing
    for (const [key, entry] of this.memoryStore.entries()) {
      // Remove expired entries
      if (now > entry.resetAt) {
        this.memoryStore.delete(key)
        continue
      }
      
      // Sync entries that haven't been synced recently
      if (!entry.lastSynced || now - entry.lastSynced > this.SYNC_INTERVAL) {
        entriesToSync.push([key, entry])
      }
    }
    
    // Batch sync to KV (max 10 at a time to avoid rate limits)
    const batches = []
    for (let i = 0; i < entriesToSync.length; i += 10) {
      batches.push(entriesToSync.slice(i, i + 10))
    }
    
    for (const batch of batches) {
      await Promise.all(
        batch.map(async ([key, entry]) => {
          try {
            await kv.set(key, {
              count: entry.count,
              resetAt: entry.resetAt
            }, { ex: 3600 }) // 1 hour TTL
            
            // Update last synced time
            entry.lastSynced = now
          } catch (error) {
            // Ignore individual sync errors
          }
        })
      )
      
      // Wait between batches to avoid rate limits
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  
  async checkLimit(
    ip: string,
    limit: number = 10,
    windowMs: number = 60000
  ): Promise<boolean> {
    const key = `rate-limit:${ip}`
    const now = Date.now()
    
    // Check memory first
    let entry = this.memoryStore.get(key)
    
    if (!entry) {
      // Try to load from KV
      try {
        const kvData = await kv.get<RateLimitEntry>(key)
        if (kvData && now <= kvData.resetAt) {
          entry = kvData
          this.memoryStore.set(key, entry)
        }
      } catch (error) {
        // Ignore KV errors, proceed with memory only
      }
    }
    
    if (!entry || now > entry.resetAt) {
      // Create new entry
      entry = {
        count: 1,
        resetAt: now + windowMs
      }
      this.memoryStore.set(key, entry)
      
      // Clean up old entries if too many
      if (this.memoryStore.size > this.MAX_ENTRIES) {
        this.cleanup()
      }
      
      return true
    }
    
    if (entry.count >= limit) {
      return false
    }
    
    // Increment count
    entry.count++
    return true
  }
  
  private cleanup() {
    const now = Date.now()
    const entriesToDelete: string[] = []
    
    // Remove expired entries
    for (const [key, entry] of this.memoryStore.entries()) {
      if (now > entry.resetAt) {
        entriesToDelete.push(key)
      }
    }
    
    entriesToDelete.forEach(key => this.memoryStore.delete(key))
    
    // If still too many, remove oldest entries
    if (this.memoryStore.size > this.MAX_ENTRIES) {
      const sortedEntries = Array.from(this.memoryStore.entries())
        .sort((a, b) => a[1].resetAt - b[1].resetAt)
      
      const toRemove = sortedEntries.slice(0, this.memoryStore.size - this.MAX_ENTRIES)
      toRemove.forEach(([key]) => this.memoryStore.delete(key))
    }
  }
  
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }
}

// Export singleton instance
export const MemoryRateLimit = {
  checkLimit: (ip: string, limit?: number, windowMs?: number) => {
    return MemoryRateLimitImpl.getInstance().checkLimit(ip, limit, windowMs)
  }
}