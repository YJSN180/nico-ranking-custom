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
  const contentType = response.headers.get('content-type') || ''
  
  // デバッグ情報（本番環境のデバッグ時のみ有効化）
  // if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  //   console.log('[FetchCompression] Response headers:', {
  //     contentEncoding,
  //     contentType,
  //     status: response.status
  //   })
  // }
  
  // まずarrayBufferとして読み込む（一度しか読めないため）
  const arrayBuffer = await response.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  // 圧縮されている場合（gzip, deflate, br）
  if (contentEncoding && ['gzip', 'deflate', 'br'].includes(contentEncoding)) {
    // ブラウザが自動的に解凍している可能性を考慮
    // まず通常のテキストとしてパースを試みる
    const textContent = new TextDecoder().decode(uint8Array)
    try {
      // 有効なJSONか確認
      return JSON.parse(textContent)
    } catch (jsonError) {
      // JSONパースに失敗した場合、圧縮データとして処理
      // デバッグログは本番環境では無効化
      // if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      //   console.log('[FetchCompression] Direct JSON parse failed, attempting decompression')
      // }
      try {
        // 統一圧縮ライブラリでデコンプレッション
        const { decompressAndParseJSON } = await import('@/lib/unified-compression')
        const result = await decompressAndParseJSON(uint8Array)
        return result.data
      } catch (decompError) {
        console.error('[FetchCompression] Decompression failed:', decompError)
        throw new Error(`Failed to parse compressed response: ${decompError.message}`)
      }
    }
  }
  
  // 非圧縮の場合
  const textContent = new TextDecoder().decode(uint8Array)
  try {
    return JSON.parse(textContent)
  } catch (error) {
    console.error('[FetchCompression] JSON parse error:', error)
    console.error('[FetchCompression] Raw content preview:', textContent.substring(0, 200))
    throw new Error(`Invalid JSON response: ${error.message}`)
  }
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