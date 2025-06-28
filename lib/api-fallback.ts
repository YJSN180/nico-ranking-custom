// Direct connection to Cloudflare Worker (本番環境) or Vercel Function proxy (プレビュー環境)
export class APIFallback {
  private static readonly CLOUDFLARE_ENDPOINT = 'https://nico-rank.com/api/ranking'
  
  // プレビュー環境の検出
  private static isPreviewEnvironment(): boolean {
    if (typeof window === 'undefined') return false
    const hostname = window.location.hostname
    
    // プレビュー環境のパターン:
    // - nico-ranking-custom-[ランダム文字列]-yjsns-projects.vercel.app
    // 本番環境のパターン:
    // - nico-ranking-custom-yjsns-projects.vercel.app (ランダム文字列なし)
    const isVercelApp = hostname.includes('.vercel.app')
    const hasRandomString = /nico-ranking-custom-[a-z0-9]+-yjsns-projects/.test(hostname)
    const isPreview = isVercelApp && hasRandomString
    
    return isPreview
  }
  
  // ETagキャッシュストア
  private static etagCache = new Map<string, string>()
  
  static async fetchWithFallback(
    params: URLSearchParams,
    signal?: AbortSignal
  ): Promise<Response> {
    const cacheKey = params.toString()
    const cachedEtag = this.etagCache.get(cacheKey)
    
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br'
    }
    
    // キャッシュされたETagがあれば条件付きリクエスト
    if (cachedEtag) {
      headers['If-None-Match'] = cachedEtag
    }
    
    // プレビュー環境では相対パスでVercel Functionプロキシを使用
    if (this.isPreviewEnvironment()) {
      const response = await fetch(`/api/ranking?${params.toString()}`, {
        signal,
        headers
      })
      
      // ETagを保存
      const etag = response.headers.get('etag')
      if (etag && response.ok) {
        this.etagCache.set(cacheKey, etag)
      }
      
      return response
    }
    
    // 本番環境ではCloudflare Worker に直接接続
    headers['Origin'] = typeof window !== 'undefined' ? window.location.origin : ''
    
    const response = await fetch(`${this.CLOUDFLARE_ENDPOINT}?${params.toString()}`, {
      signal,
      headers
    })
    
    // ETagを保存
    const etag = response.headers.get('etag')
    if (etag && response.ok) {
      this.etagCache.set(cacheKey, etag)
    }
    
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