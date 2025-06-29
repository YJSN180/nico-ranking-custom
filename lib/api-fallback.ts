// Direct connection to Cloudflare Worker (Vercel Function を使わない)
export class APIFallback {
  private static readonly CLOUDFLARE_ENDPOINT = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com/api/ranking'
  
  static async fetchWithFallback(
    params: URLSearchParams,
    signal?: AbortSignal
  ): Promise<Response> {
    // プレビュー環境などでは相対URLを使用
    const isPreview = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')
    const endpoint = isPreview ? '/api/ranking' : this.CLOUDFLARE_ENDPOINT
    
    const response = await fetch(`${endpoint}?${params.toString()}`, {
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