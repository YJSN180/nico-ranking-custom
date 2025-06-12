/**
 * Advanced Cache Manager for Nico Ranking
 * 
 * Implements:
 * - Multi-layer caching (Browser, Edge, Origin)
 * - Stale-while-revalidate pattern
 * - Incremental updates
 * - Cache invalidation strategies
 * - Performance monitoring
 */

export interface CacheEntry<T> {
  data: T
  timestamp: number
  etag: string
  maxAge: number
  staleWhileRevalidate: number
}

export interface CacheOptions {
  maxAge?: number // seconds
  staleWhileRevalidate?: number // seconds
  dependencies?: string[]
}

export interface CacheMetrics {
  hits: number
  misses: number
  hitRate: number
  avgResponseTime: number
  cacheSize: number
}

export class CacheManager {
  private static instance: CacheManager
  private cache: Map<string, CacheEntry<any>> = new Map()
  private dependencies: Map<string, Set<string>> = new Map()
  private metrics = {
    hits: 0,
    misses: 0,
    responseTimes: [] as number[]
  }
  
  // Cache configuration
  private readonly DEFAULT_MAX_AGE = 30 // 30 seconds
  private readonly DEFAULT_STALE_WHILE_REVALIDATE = 60 // 60 seconds
  private readonly CACHE_VERSION = 'v2'
  private readonly MAX_CACHE_SIZE = 50 // Maximum number of entries
  
  private constructor() {
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager()
    }
    return CacheManager.instance
  }
  
  /**
   * Generate a versioned cache key
   */
  generateKey(params: {
    type: 'ranking' | 'tags' | 'stats'
    genre?: string
    period?: string
    tag?: string
    page?: number
  }): string {
    const parts = [this.CACHE_VERSION, params.type]
    
    if (params.genre) parts.push(params.genre)
    if (params.period) parts.push(params.period)
    if (params.tag) parts.push('tag', params.tag)
    if (params.page && params.page > 1) parts.push('page', params.page.toString())
    
    return parts.join(':')
  }
  
  /**
   * Get data from cache with stale-while-revalidate support
   */
  async get<T>(
    key: string,
    fetcher?: () => Promise<T>
  ): Promise<{ data: T, stale: boolean, fromCache: boolean }> {
    const startTime = Date.now()
    const entry = this.cache.get(key)
    
    if (entry) {
      const now = Date.now()
      const age = (now - entry.timestamp) / 1000 // age in seconds
      
      // Fresh data
      if (age < entry.maxAge) {
        this.recordHit(Date.now() - startTime)
        return { data: entry.data, stale: false, fromCache: true }
      }
      
      // Stale but still serveable
      if (age < entry.maxAge + entry.staleWhileRevalidate) {
        this.recordHit(Date.now() - startTime)
        
        // Trigger background revalidation if fetcher provided
        if (fetcher) {
          this.revalidateInBackground(key, fetcher, entry)
        }
        
        return { data: entry.data, stale: true, fromCache: true }
      }
    }
    
    // Cache miss or expired
    this.recordMiss(Date.now() - startTime)
    
    if (fetcher) {
      const data = await fetcher()
      this.set(key, data)
      return { data, stale: false, fromCache: false }
    }
    
    throw new Error(`Cache miss for key: ${key}`)
  }
  
  /**
   * Set data in cache
   */
  set<T>(
    key: string,
    data: T,
    options: CacheOptions = {}
  ): void {
    // Enforce cache size limit
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest()
    }
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      etag: this.generateETag(data),
      maxAge: options.maxAge || this.DEFAULT_MAX_AGE,
      staleWhileRevalidate: options.staleWhileRevalidate || this.DEFAULT_STALE_WHILE_REVALIDATE
    }
    
    this.cache.set(key, entry)
    
    // Register dependencies
    if (options.dependencies) {
      options.dependencies.forEach(dep => {
        if (!this.dependencies.has(dep)) {
          this.dependencies.set(dep, new Set())
        }
        this.dependencies.get(dep)!.add(key)
      })
    }
  }
  
  /**
   * Invalidate cache and its dependencies
   */
  invalidate(key: string): string[] {
    const invalidated = [key]
    this.cache.delete(key)
    
    // Invalidate dependent caches
    const deps = this.dependencies.get(key)
    if (deps) {
      deps.forEach(depKey => {
        this.cache.delete(depKey)
        invalidated.push(depKey)
      })
      this.dependencies.delete(key)
    }
    
    return invalidated
  }
  
  /**
   * Handle conditional requests with ETag
   */
  handleConditionalRequest(
    key: string,
    etag?: string | null
  ): { status: number, data?: any, headers: Record<string, string> } {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return { status: 404, headers: {} }
    }
    
    const headers: Record<string, string> = {
      'ETag': entry.etag,
      'Cache-Control': `public, max-age=${entry.maxAge}, stale-while-revalidate=${entry.staleWhileRevalidate}`,
      'Last-Modified': new Date(entry.timestamp).toUTCString()
    }
    
    // Check if client has the same version
    if (etag === entry.etag) {
      return { status: 304, headers }
    }
    
    return { status: 200, data: entry.data, headers }
  }
  
  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    const total = this.metrics.hits + this.metrics.misses
    const hitRate = total === 0 ? 0 : (this.metrics.hits / total) * 100
    const avgResponseTime = this.metrics.responseTimes.length === 0
      ? 0
      : this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
    
    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate,
      avgResponseTime,
      cacheSize: this.cache.size
    }
  }
  
  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    this.dependencies.clear()
    this.metrics = {
      hits: 0,
      misses: 0,
      responseTimes: []
    }
  }
  
  // Private methods
  
  private revalidateInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    currentEntry: CacheEntry<T>
  ): void {
    // Fire and forget
    fetcher()
      .then(data => {
        // Only update if data has changed
        const newETag = this.generateETag(data)
        if (newETag !== currentEntry.etag) {
          this.set(key, data, {
            maxAge: currentEntry.maxAge,
            staleWhileRevalidate: currentEntry.staleWhileRevalidate
          })
        }
      })
      .catch(err => {
        console.error(`Failed to revalidate cache for key ${key}:`, err)
      })
  }
  
  private generateETag(data: any): string {
    // Simple hash based on JSON string
    const str = JSON.stringify(data)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `W/"${Math.abs(hash).toString(16)}"`
  }
  
  private recordHit(responseTime: number): void {
    this.metrics.hits++
    this.metrics.responseTimes.push(responseTime)
    
    // Keep only last 100 response times
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes.shift()
    }
  }
  
  private recordMiss(responseTime: number): void {
    this.metrics.misses++
    this.metrics.responseTimes.push(responseTime)
    
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes.shift()
    }
  }
  
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      this.invalidate(oldestKey)
    }
  }
  
  private cleanup(): void {
    const now = Date.now()
    const keysToDelete: string[] = []
    
    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000
      if (age > entry.maxAge + entry.staleWhileRevalidate) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => this.invalidate(key))
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance()