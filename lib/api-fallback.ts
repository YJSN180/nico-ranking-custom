// API fallback mechanism for handling rate limits
export class APIFallback {
  private static readonly EDGE_ENDPOINT = '/api/edge/ranking'
  private static readonly NODE_ENDPOINT = '/api/ranking'
  private static failureCount = 0
  private static lastFailureTime = 0
  private static readonly FAILURE_THRESHOLD = 3
  private static readonly FAILURE_WINDOW = 60000 // 1 minute
  
  static async fetchWithFallback(
    params: URLSearchParams,
    signal?: AbortSignal
  ): Promise<Response> {
    // Check if we should use Edge Functions as primary
    const shouldUseEdge = this.shouldUseEdgeFunctions()
    
    const endpoints = shouldUseEdge 
      ? [this.EDGE_ENDPOINT, this.NODE_ENDPOINT]
      : [this.NODE_ENDPOINT, this.EDGE_ENDPOINT]
    
    let lastError: Error | null = null
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint}?${params.toString()}`, {
          signal,
          // Add cache headers for CDN
          headers: {
            'Cache-Control': 'public, s-maxage=300'
          }
        })
        
        // If we get rate limited on Node.js, immediately try Edge
        if (response.status === 429 && endpoint === this.NODE_ENDPOINT) {
          this.recordFailure()
          continue
        }
        
        // Success - reset failure count if using Node.js
        if (response.ok && endpoint === this.NODE_ENDPOINT) {
          this.failureCount = 0
        }
        
        return response
      } catch (error) {
        lastError = error as Error
        // Continue to next endpoint
      }
    }
    
    // Both endpoints failed
    throw lastError || new Error('All API endpoints failed')
  }
  
  private static shouldUseEdgeFunctions(): boolean {
    // Clean up old failures
    const now = Date.now()
    if (now - this.lastFailureTime > this.FAILURE_WINDOW) {
      this.failureCount = 0
    }
    
    // Use Edge Functions if we've had multiple failures recently
    return this.failureCount >= this.FAILURE_THRESHOLD
  }
  
  private static recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    // Log when switching to Edge Functions
    if (this.failureCount === this.FAILURE_THRESHOLD) {
      console.warn('[APIFallback] Switching to Edge Functions due to rate limits')
    }
  }
  
  static getStatus(): {
    usingEdge: boolean
    failureCount: number
    lastFailureTime: number
  } {
    return {
      usingEdge: this.shouldUseEdgeFunctions(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    }
  }
}