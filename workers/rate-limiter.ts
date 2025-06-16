/**
 * Rate limiting utilities for Cloudflare Workers
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface RateLimitConfig {
  requests: number
  window: number
}

export interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

// メモリキャッシュ（Workers内でリクエスト間で共有）
const memoryCache = new Map<string, { count: number; expires: number }>()

/**
 * Check rate limit for a given request
 */
export async function checkRateLimit(
  request: Request,
  kvNamespace: KVNamespace | undefined,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // KVが設定されていない場合は常に許可
  if (!kvNamespace) {
    return { 
      allowed: true, 
      remaining: config.requests, 
      resetAt: 0 
    }
  }

  // クライアントIPを取得
  const clientIP = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
                   'unknown'
  
  const now = Date.now()
  const windowStart = Math.floor(now / config.window) * config.window
  const key = `ratelimit:${clientIP}:${windowStart}`
  
  try {
    // メモリキャッシュをチェック
    const cached = memoryCache.get(key)
    let count = 0
    
    if (cached && cached.expires > now) {
      count = cached.count
    } else {
      // キャッシュミスの場合のみKVから取得
      const currentCount = await kvNamespace.get(key)
      count = currentCount ? parseInt(currentCount, 10) : 0
      
      // メモリキャッシュに保存（5秒間有効）
      memoryCache.set(key, { count, expires: now + 5000 })
      
      // メモリキャッシュのクリーンアップ（100エントリを超えたら古いものを削除）
      if (memoryCache.size > 100) {
        const entries = Array.from(memoryCache.entries())
        entries.sort((a, b) => a[1].expires - b[1].expires)
        entries.slice(0, 50).forEach(([k]) => memoryCache.delete(k))
      }
    }
    
    if (count >= config.requests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowStart + config.window
      }
    }
    
    // カウントを増やして保存（書き込み頻度を大幅に削減）
    // 10リクエストごと、または制限値に近い場合のみ更新
    const newCount = count + 1
    const shouldUpdate = newCount === 1 || newCount % 10 === 0 || newCount >= config.requests - 5
    
    if (shouldUpdate) {
      // リトライロジックを追加して429エラーに対応
      let retries = 3
      while (retries > 0) {
        try {
          await kvNamespace.put(
            key, 
            String(newCount), 
            { 
              expirationTtl: Math.ceil(config.window / 1000) + 60 // TTLは秒単位 + バッファ
            }
          )
          break // 成功したらループを抜ける
        } catch (error: any) {
          if (error.message?.includes('429') && retries > 1) {
            // 429エラーの場合は少し待ってリトライ
            await new Promise(resolve => setTimeout(resolve, 1000))
            retries--
          } else {
            // その他のエラーまたは最後のリトライ失敗
            console.error('Rate limit KV write failed:', error)
            break
          }
        }
      }
    }
    
    // メモリキャッシュを更新（実際のカウントを反映）
    memoryCache.set(key, { count: newCount, expires: now + 5000 })
    
    return {
      allowed: true,
      remaining: config.requests - count - 1,
      resetAt: windowStart + config.window
    }
  } catch (error) {
    // エラーが発生した場合は安全側に倒して許可
    console.error('Rate limit check failed:', error)
    return {
      allowed: true,
      remaining: config.requests,
      resetAt: 0
    }
  }
}

/**
 * Determine if a path should be rate limited
 */
export function shouldRateLimit(pathname: string): boolean {
  // 静的アセットは除外
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i.test(pathname)) {
    return false
  }
  
  // Next.js静的ファイル
  if (pathname.startsWith('/_next/static/') || pathname.startsWith('/_next/image/')) {
    return false
  }
  
  // faviconなど
  if (pathname === '/favicon.ico' || pathname === '/robots.txt') {
    return false
  }
  
  return true
}

/**
 * Get rate limit configuration based on path
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig {
  // Admin endpoints have the strictest limits (check first)
  if (pathname.startsWith('/api/admin/')) {
    return { 
      requests: 20,    // 20 requests
      window: 60000    // per minute
    }
  }
  
  // API endpoints have stricter limits
  if (pathname.startsWith('/api/')) {
    return { 
      requests: 50,    // 50 requests
      window: 60000    // per minute
    }
  }
  
  // Regular pages
  return { 
    requests: 200,   // 200 requests
    window: 60000    // per minute
  }
}