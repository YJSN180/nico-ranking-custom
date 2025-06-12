/**
 * Simple in-memory rate limiter
 * In production, use Redis or Cloudflare's rate limiting
 */

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
}

interface RateLimitInfo {
  requests: number[]
  blocked: boolean
}

class RateLimiter {
  private store: Map<string, RateLimitInfo> = new Map()
  private config: RateLimitConfig

  constructor(config: RateLimitConfig) {
    this.config = config
    
    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60000)
  }

  /**
   * Check if request should be allowed
   */
  async checkLimit(identifier: string): Promise<{
    allowed: boolean
    remaining: number
    resetAt: Date
  }> {
    const now = Date.now()
    const windowStart = now - this.config.windowMs
    
    // Get or create entry
    let info = this.store.get(identifier)
    if (!info) {
      info = { requests: [], blocked: false }
      this.store.set(identifier, info)
    }
    
    // Filter out old requests
    info.requests = info.requests.filter(time => time > windowStart)
    
    // Check if limit exceeded
    if (info.requests.length >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date((info.requests[0] || now) + this.config.windowMs)
      }
    }
    
    // Add current request
    info.requests.push(now)
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - info.requests.length,
      resetAt: new Date(now + this.config.windowMs)
    }
  }

  /**
   * Clean up old entries to prevent memory leak
   */
  private cleanup() {
    const now = Date.now()
    const windowStart = now - this.config.windowMs
    
    for (const [key, info] of this.store.entries()) {
      // Remove entries with no recent requests
      if (info.requests.every(time => time < windowStart)) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Reset rate limiter (for testing)
   */
  reset() {
    this.store.clear()
  }
}

// Default rate limiters for different endpoints
export const apiRateLimiter = new RateLimiter({
  windowMs: 10 * 1000, // 10 seconds
  maxRequests: 10 // 10 requests per 10 seconds
})

export const adminRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5 // 5 requests per minute
})

export const debugRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20 // 20 requests per minute
})

/**
 * Express/Next.js middleware wrapper
 */
export function createRateLimitMiddleware(limiter: RateLimiter) {
  return async function rateLimitMiddleware(
    request: Request,
    identifier?: string
  ): Promise<Response | null> {
    // Get identifier (IP address or custom)
    const id = identifier || 
      request.headers.get('x-forwarded-for')?.split(',')[0] || 
      request.headers.get('x-real-ip') ||
      'unknown'
    
    const { allowed, remaining, resetAt } = await limiter.checkLimit(id)
    
    if (!allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.'
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': limiter['config'].maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetAt.toISOString()
          }
        }
      )
    }
    
    // Add rate limit headers to the response
    return null // Continue to handler
  }
}

export default RateLimiter