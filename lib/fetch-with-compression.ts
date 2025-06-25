/**
 * 統一圧縮システム対応のfetchラッパー
 * SSRとクライアントサイドの両方で圧縮レスポンスを適切に処理
 */

interface FetchOptions extends RequestInit {
  // Next.jsのnextオプションを含める
  next?: {
    revalidate?: number | false
    tags?: string[]
  }
}

/**
 * 圧縮対応fetch関数
 * Content-Encodingを確認して自動的にデコンプレッション
 */
export async function fetchWithCompression(
  url: string, 
  options: FetchOptions = {}
): Promise<Response> {
  
  // Accept-Encodingヘッダーを自動設定
  const headers = new Headers(options.headers)
  if (!headers.has('Accept-Encoding')) {
    headers.set('Accept-Encoding', 'gzip, deflate, br')
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    headers
  })

  return response
}

/**
 * 圧縮対応JSONパース関数
 * レスポンスの圧縮状態を自動判定してパース
 */
export async function parseCompressedJSON(response: Response): Promise<any> {
  const contentEncoding = response.headers.get('content-encoding')
  
  // 圧縮されている場合
  if (contentEncoding === 'gzip' || contentEncoding === 'deflate') {
    const arrayBuffer = await response.arrayBuffer()
    try {
      // 統一圧縮ライブラリでデコンプレッション
      const { decompressAndParseJSON } = await import('@/lib/unified-compression')
      const result = await decompressAndParseJSON(new Uint8Array(arrayBuffer))
      return result.data
    } catch (decompError) {
      console.error('[FetchCompression] Decompression failed:', decompError)
      // フォールバック: 通常のテキストデコード
      const textContent = new TextDecoder().decode(arrayBuffer)
      return JSON.parse(textContent)
    }
  }
  
  // 非圧縮の場合は通常のJSON解析
  return response.json()
}

/**
 * 圧縮対応のワンライナーfetch + JSON parse
 */
export async function fetchJSON<T = any>(
  url: string, 
  options: FetchOptions = {}
): Promise<T> {
  const response = await fetchWithCompression(url, options)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  return parseCompressedJSON(response)
}