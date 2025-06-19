// Client-side request throttling to prevent 429 errors
interface ThrottleEntry {
  lastRequest: number
  requestCount: number
  resetTime: number
}

const WINDOW_SIZE = 10 * 1000 // 10 seconds window
const MAX_REQUESTS_PER_WINDOW = 10 // Max 10 requests per 10 seconds
const MIN_REQUEST_INTERVAL = 100 // Minimum 100ms between requests

class RequestThrottle {
  private throttleMap = new Map<string, ThrottleEntry>()
  
  private getKey(url: string): string {
    // Extract API endpoint from URL
    try {
      const urlObj = new URL(url, window.location.origin)
      return urlObj.pathname
    } catch {
      return url
    }
  }
  
  async throttle(url: string): Promise<void> {
    const key = this.getKey(url)
    const now = Date.now()
    
    let entry = this.throttleMap.get(key)
    
    // Initialize or reset entry if window expired
    if (!entry || now > entry.resetTime) {
      entry = {
        lastRequest: 0,
        requestCount: 0,
        resetTime: now + WINDOW_SIZE
      }
      this.throttleMap.set(key, entry)
    }
    
    // Check if we've hit the rate limit
    if (entry.requestCount >= MAX_REQUESTS_PER_WINDOW) {
      const waitTime = entry.resetTime - now
      if (waitTime > 0) {
        // Wait until the window resets
        await new Promise(resolve => setTimeout(resolve, waitTime))
        // Reset the entry after waiting
        entry.requestCount = 0
        entry.resetTime = Date.now() + WINDOW_SIZE
      }
    }
    
    // Enforce minimum interval between requests
    const timeSinceLastRequest = now - entry.lastRequest
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => 
        setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      )
    }
    
    // Update the entry
    entry.lastRequest = Date.now()
    entry.requestCount++
  }
  
  // Clean up old entries periodically
  cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.throttleMap.entries()) {
      if (now > entry.resetTime + WINDOW_SIZE) {
        this.throttleMap.delete(key)
      }
    }
  }
}

// Singleton instance
export const requestThrottle = new RequestThrottle()

// Clean up old entries every minute
if (typeof window !== 'undefined') {
  setInterval(() => requestThrottle.cleanup(), 60 * 1000)
}