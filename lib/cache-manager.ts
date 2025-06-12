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

// キャッシュタグの管理
export class CacheTagManager {
  private tags: Map<string, Set<string>> = new Map()
  private keyToTags: Map<string, Set<string>> = new Map()

  addTag(key: string, tag: string): void {
    // タグ -> キーのマッピング
    if (!this.tags.has(tag)) {
      this.tags.set(tag, new Set())
    }
    this.tags.get(tag)!.add(key)
    
    // キー -> タグのマッピング
    if (!this.keyToTags.has(key)) {
      this.keyToTags.set(key, new Set())
    }
    this.keyToTags.get(key)!.add(tag)
  }

  addTags(key: string, tags: string[]): void {
    tags.forEach(tag => this.addTag(key, tag))
  }

  invalidateTag(tag: string): string[] {
    const keys = Array.from(this.tags.get(tag) || [])
    
    // タグに関連するすべてのキーを削除
    keys.forEach(key => {
      const keyTags = this.keyToTags.get(key)
      if (keyTags) {
        keyTags.delete(tag)
        if (keyTags.size === 0) {
          this.keyToTags.delete(key)
        }
      }
    })
    
    this.tags.delete(tag)
    return keys
  }

  invalidateTags(tags: string[]): string[] {
    const allKeys = new Set<string>()
    tags.forEach(tag => {
      const keys = this.invalidateTag(tag)
      keys.forEach(key => allKeys.add(key))
    })
    return Array.from(allKeys)
  }

  removeKey(key: string): void {
    const tags = this.keyToTags.get(key)
    if (tags) {
      tags.forEach(tag => {
        const keys = this.tags.get(tag)
        if (keys) {
          keys.delete(key)
          if (keys.size === 0) {
            this.tags.delete(tag)
          }
        }
      })
      this.keyToTags.delete(key)
    }
  }

  getTagsForKey(key: string): string[] {
    return Array.from(this.keyToTags.get(key) || [])
  }

  getKeysForTag(tag: string): string[] {
    return Array.from(this.tags.get(tag) || [])
  }
}

// 高度なキャッシュマネージャー
export class AdvancedCacheManager extends CacheManager {
  private tagManager = new CacheTagManager()
  private warmupQueue: Set<string> = new Set()
  private coalesceMap: Map<string, Promise<any>> = new Map()
  
  /**
   * タグ付きでキャッシュを設定
   */
  setWithTags<T>(
    key: string,
    data: T,
    tags: string[],
    options: CacheOptions = {}
  ): void {
    this.set(key, data, options)
    this.tagManager.addTags(key, tags)
  }
  
  /**
   * タグによるキャッシュ無効化
   */
  invalidateByTag(tag: string): string[] {
    const keys = this.tagManager.invalidateTag(tag)
    keys.forEach(key => super.invalidate(key))
    return keys
  }
  
  /**
   * 複数タグによるキャッシュ無効化
   */
  invalidateByTags(tags: string[]): string[] {
    const keys = this.tagManager.invalidateTags(tags)
    keys.forEach(key => super.invalidate(key))
    return keys
  }
  
  /**
   * リクエスト結合付きのget
   */
  async getWithCoalesce<T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<{ data: T, stale: boolean, fromCache: boolean }> {
    // 既に同じキーでフェッチ中の場合は結合
    if (this.coalesceMap.has(key)) {
      const data = await this.coalesceMap.get(key)
      return { data, stale: false, fromCache: false }
    }
    
    // キャッシュチェック
    try {
      const cached = await super.get(key)
      if (cached.fromCache) {
        return cached
      }
    } catch {
      // キャッシュミス
    }
    
    // 新規フェッチ（結合）
    const promise = fetcher()
    this.coalesceMap.set(key, promise)
    
    try {
      const data = await promise
      this.set(key, data)
      return { data, stale: false, fromCache: false }
    } finally {
      this.coalesceMap.delete(key)
    }
  }
  
  /**
   * キャッシュウォーミング
   */
  async warmup(
    keys: string[],
    fetcher: (key: string) => Promise<any>
  ): Promise<void> {
    const promises = keys.map(async key => {
      if (this.warmupQueue.has(key)) {
        return // 既にウォーミング中
      }
      
      this.warmupQueue.add(key)
      
      try {
        const data = await fetcher(key)
        this.set(key, data)
      } catch (error) {
        console.error(`Failed to warmup cache for key ${key}:`, error)
      } finally {
        this.warmupQueue.delete(key)
      }
    })
    
    await Promise.all(promises)
  }
  
  /**
   * 階層型キャッシュの設定
   */
  setTiered<T>(
    key: string,
    data: T,
    tiers: {
      browser?: number
      edge?: number
      origin?: number
    }
  ): void {
    const options: CacheOptions = {
      maxAge: tiers.edge || 30,
      staleWhileRevalidate: tiers.origin || 60
    }
    
    this.set(key, data, options)
  }
  
  /**
   * 無効化時にタグマネージャーもクリーンアップ
   */
  invalidate(key: string): string[] {
    this.tagManager.removeKey(key)
    return super.invalidate(key)
  }
  
  /**
   * クリア時にタグマネージャーもクリア
   */
  clear(): void {
    super.clear()
    this.tagManager = new CacheTagManager()
    this.warmupQueue.clear()
    this.coalesceMap.clear()
  }
}

// Export singleton instances
export const cacheManager = CacheManager.getInstance()
export const advancedCacheManager = new AdvancedCacheManager()