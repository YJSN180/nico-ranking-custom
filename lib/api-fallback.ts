// Simplified API without Edge runtime support
export class APIFallback {
  private static readonly NODE_ENDPOINT = '/api/ranking'
  
  static async fetchWithFallback(
    params: URLSearchParams,
    signal?: AbortSignal
  ): Promise<Response> {
    // Use Node.js endpoint only (Edge removed due to zlib incompatibility)
    const response = await fetch(`${this.NODE_ENDPOINT}?${params.toString()}`, {
      signal,
      // Add headers to ensure proper decompression
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    })
    
    return response
  }
  
  static getStatus(): {
    usingEdge: boolean
    failureCount: number
    lastFailureTime: number
  } {
    // Always return false for Edge since it's not supported
    return {
      usingEdge: false,
      failureCount: 0,
      lastFailureTime: 0
    }
  }
}