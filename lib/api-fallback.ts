// Direct connection to Cloudflare Worker (Vercel Function を使わない)
export class APIFallback {
  private static readonly CLOUDFLARE_ENDPOINT = 'https://nico-rank.com/api/ranking'
  
  static async fetchWithFallback(
    params: URLSearchParams,
    signal?: AbortSignal
  ): Promise<Response> {
    // Cloudflare Worker に直接接続（Vercel Function をバイパス）
    const response = await fetch(`${this.CLOUDFLARE_ENDPOINT}?${params.toString()}`, {
      signal,
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        // CORS対応のため Origin を設定
        'Origin': typeof window !== 'undefined' ? window.location.origin : ''
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