import type { KVNamespace } from '@cloudflare/workers-types'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  reset: number
}

export interface RateLimiter {
  isAllowed(key: string, limit: number, window: number): Promise<RateLimitResult>
  reset(key: string): Promise<void>
}

// KVベースのレート制限
export class KVRateLimiter implements RateLimiter {
  constructor(private kv: KVNamespace) {}

  async isAllowed(key: string, limit: number, window: number): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = Math.floor(now / (window * 1000)) * (window * 1000)
    const storageKey = `${key}:${windowStart}`
    
    const current = await this.kv.get(storageKey)
    const count = current ? parseInt(current) : 0
    
    if (count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        reset: windowStart + (window * 1000)
      }
    }
    
    await this.kv.put(storageKey, (count + 1).toString(), {
      expirationTtl: window
    })
    
    return {
      allowed: true,
      remaining: limit - count - 1,
      reset: windowStart + (window * 1000)
    }
  }

  async reset(key: string): Promise<void> {
    // KVでは特定のキーのプレフィックスで削除することはできないため、
    // 実装は省略（TTLに任せる）
  }
}

// 階層的レート制限
export class TieredRateLimiter implements RateLimiter {
  private limiters: Map<string, RateLimiter> = new Map()
  
  constructor(
    private kv: KVNamespace,
    private tiers: {
      burst: { limit: number, window: number }
      sustained: { limit: number, window: number }
      daily: { limit: number, window: number }
    }
  ) {
    this.limiters.set('burst', new KVRateLimiter(kv))
    this.limiters.set('sustained', new KVRateLimiter(kv))
    this.limiters.set('daily', new KVRateLimiter(kv))
  }
  
  async isAllowed(key: string, limit: number, window: number): Promise<RateLimitResult> {
    // バースト制限チェック
    const burstResult = await this.limiters.get('burst')!.isAllowed(
      `burst:${key}`,
      this.tiers.burst.limit,
      this.tiers.burst.window
    )
    
    if (!burstResult.allowed) {
      return burstResult
    }
    
    // 持続的制限チェック
    const sustainedResult = await this.limiters.get('sustained')!.isAllowed(
      `sustained:${key}`,
      this.tiers.sustained.limit,
      this.tiers.sustained.window
    )
    
    if (!sustainedResult.allowed) {
      return sustainedResult
    }
    
    // 日次制限チェック
    const dailyResult = await this.limiters.get('daily')!.isAllowed(
      `daily:${key}`,
      this.tiers.daily.limit,
      this.tiers.daily.window
    )
    
    return dailyResult
  }
  
  async reset(key: string): Promise<void> {
    await Promise.all([
      this.limiters.get('burst')!.reset(`burst:${key}`),
      this.limiters.get('sustained')!.reset(`sustained:${key}`),
      this.limiters.get('daily')!.reset(`daily:${key}`)
    ])
  }
}

// 分散レート制限（複数のWorkerインスタンス間で共有）
export class DistributedRateLimiter implements RateLimiter {
  constructor(
    private kv: KVNamespace,
    private tolerance: number = 1.1 // 10%の許容誤差
  ) {}
  
  async isAllowed(key: string, limit: number, window: number): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = Math.floor(now / (window * 1000)) * (window * 1000)
    const storageKey = `dist:${key}:${windowStart}`
    
    // 楽観的アプローチ: 先にインクリメントしてから確認
    const { value, metadata } = await this.kv.getWithMetadata<{ count: number }>(storageKey)
    const currentCount = metadata?.count || 0
    
    // 許容誤差を考慮した制限値
    const effectiveLimit = Math.floor(limit * this.tolerance)
    
    if (currentCount >= effectiveLimit) {
      return {
        allowed: false,
        remaining: 0,
        reset: windowStart + (window * 1000)
      }
    }
    
    // アトミックなインクリメント（Cloudflare KVの制約により擬似的）
    await this.kv.put(storageKey, new Date().toISOString(), {
      expirationTtl: window,
      metadata: { count: currentCount + 1 }
    })
    
    return {
      allowed: true,
      remaining: Math.max(0, limit - currentCount - 1),
      reset: windowStart + (window * 1000)
    }
  }
  
  async reset(key: string): Promise<void> {
    // 実装は省略
  }
}

// スライディングウィンドウレート制限
export class SlidingWindowRateLimiter implements RateLimiter {
  constructor(private kv: KVNamespace) {}
  
  async isAllowed(key: string, limit: number, window: number): Promise<RateLimitResult> {
    const now = Date.now()
    const windowMs = window * 1000
    const windowStart = now - windowMs
    
    // 過去のリクエストタイムスタンプを取得
    const timestampsStr = await this.kv.get(`sliding:${key}`)
    let timestamps: number[] = timestampsStr ? JSON.parse(timestampsStr) : []
    
    // 古いタイムスタンプを削除
    timestamps = timestamps.filter(ts => ts > windowStart)
    
    if (timestamps.length >= limit) {
      return {
        allowed: false,
        remaining: 0,
        reset: timestamps[0] + windowMs
      }
    }
    
    // 新しいリクエストを追加
    timestamps.push(now)
    
    // 保存（最大でlimit * 2個まで保持）
    if (timestamps.length > limit * 2) {
      timestamps = timestamps.slice(-limit)
    }
    
    await this.kv.put(`sliding:${key}`, JSON.stringify(timestamps), {
      expirationTtl: window * 2
    })
    
    return {
      allowed: true,
      remaining: limit - timestamps.length,
      reset: now + windowMs
    }
  }
  
  async reset(key: string): Promise<void> {
    await this.kv.delete(`sliding:${key}`)
  }
}

// トークンバケットアルゴリズム
export class TokenBucketRateLimiter implements RateLimiter {
  constructor(
    private kv: KVNamespace,
    private bucketSize: number,
    private refillRate: number // tokens per second
  ) {}
  
  async isAllowed(key: string, limit: number, window: number): Promise<RateLimitResult> {
    const now = Date.now()
    const bucketKey = `bucket:${key}`
    
    // バケットの状態を取得
    const bucketData = await this.kv.get(bucketKey)
    let bucket = bucketData ? JSON.parse(bucketData) : {
      tokens: this.bucketSize,
      lastRefill: now
    }
    
    // トークンを補充
    const timeSinceLastRefill = (now - bucket.lastRefill) / 1000
    const tokensToAdd = timeSinceLastRefill * this.refillRate
    bucket.tokens = Math.min(this.bucketSize, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
    
    // トークンが足りるか確認
    if (bucket.tokens < 1) {
      const waitTime = (1 - bucket.tokens) / this.refillRate * 1000
      
      await this.kv.put(bucketKey, JSON.stringify(bucket), {
        expirationTtl: 3600 // 1時間
      })
      
      return {
        allowed: false,
        remaining: 0,
        reset: now + waitTime
      }
    }
    
    // トークンを消費
    bucket.tokens -= 1
    
    await this.kv.put(bucketKey, JSON.stringify(bucket), {
      expirationTtl: 3600 // 1時間
    })
    
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      reset: now + (this.bucketSize / this.refillRate * 1000)
    }
  }
  
  async reset(key: string): Promise<void> {
    await this.kv.delete(`bucket:${key}`)
  }
}

// レート制限ミドルウェア
export function createAdvancedRateLimitMiddleware(
  limiter: RateLimiter,
  keyExtractor: (request: Request) => string,
  limit: number,
  window: number
) {
  return async function rateLimitMiddleware(request: Request): Promise<Response | null> {
    const key = keyExtractor(request)
    const result = await limiter.isAllowed(key, limit, window)
    
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000)
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': new Date(result.reset).toISOString()
          }
        }
      )
    }
    
    return null
  }
}