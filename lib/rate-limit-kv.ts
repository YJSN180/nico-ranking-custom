/**
 * CloudFlare KV based rate limiting for persistent rate limiting across instances
 */

import { kv } from './simple-kv'

interface RateLimitEntry {
  count: number
  resetAt: number
}

export class KVRateLimit {
  private static readonly PREFIX = 'rate-limit:'
  private static readonly TTL = 3600 // 1 hour TTL for rate limit entries

  /**
   * Check if an IP is rate limited
   * @param ip - IP address to check
   * @param limit - Request limit
   * @param windowMs - Time window in milliseconds
   * @returns true if request is allowed, false if rate limited
   */
  static async checkLimit(
    ip: string,
    limit: number = 10,
    windowMs: number = 60000
  ): Promise<boolean> {
    // 開発環境では常に許可
    if (process.env.NODE_ENV === 'development') {
      return true
    }

    const key = `${this.PREFIX}${ip}`
    const now = Date.now()

    try {
      // Get current rate limit data
      const data = await kv.get<RateLimitEntry>(key)

      if (!data || now > data.resetAt) {
        // Create new entry
        await kv.set(key, {
          count: 1,
          resetAt: now + windowMs
        }, { ex: this.TTL })
        return true
      }

      if (data.count >= limit) {
        // Rate limited
        return false
      }

      // Increment count
      await kv.set(key, {
        ...data,
        count: data.count + 1
      }, { ex: this.TTL })
      
      return true
    } catch (error) {
      // On error, allow the request but log
      console.error('[RATE_LIMIT] KV error:', error)
      return true
    }
  }

  /**
   * Get remaining requests for an IP
   * @param ip - IP address to check
   * @param limit - Request limit
   * @param windowMs - Time window in milliseconds
   * @returns Object with limit info
   */
  static async getLimitInfo(
    ip: string,
    limit: number = 10,
    windowMs: number = 60000
  ): Promise<{
    remaining: number
    resetAt: number
    retryAfter: number
  }> {
    const key = `${this.PREFIX}${ip}`
    const now = Date.now()

    try {
      const data = await kv.get<RateLimitEntry>(key)

      if (!data || now > data.resetAt) {
        return {
          remaining: limit,
          resetAt: now + windowMs,
          retryAfter: 0
        }
      }

      const remaining = Math.max(0, limit - data.count)
      const retryAfter = remaining === 0 ? Math.ceil((data.resetAt - now) / 1000) : 0

      return {
        remaining,
        resetAt: data.resetAt,
        retryAfter
      }
    } catch (error) {
      // On error, return default values
      console.error('[RATE_LIMIT] KV error:', error)
      return {
        remaining: limit,
        resetAt: now + windowMs,
        retryAfter: 0
      }
    }
  }

  /**
   * Reset rate limit for an IP (admin function)
   * @param ip - IP address to reset
   */
  static async reset(ip: string): Promise<void> {
    const key = `${this.PREFIX}${ip}`
    try {
      await kv.del(key)
    } catch (error) {
      console.error('[RATE_LIMIT] Failed to reset:', error)
    }
  }
}