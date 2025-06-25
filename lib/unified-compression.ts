/**
 * 統一圧縮システム
 * 
 * シンプルな圧縮・解凍処理
 * - ブラウザ: 自動的に解凍される（Content-Encoding: gzip）
 * - Node.js/SSR: 手動解凍が必要
 */

/**
 * gzipマジックナンバーをチェック
 */
export function isGzipped(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b
}

/**
 * SSR環境でのgzip解凍
 * Node.js環境でのみ使用
 */
export async function decompressGzipInSSR(buffer: ArrayBuffer): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new Error('This function should only be called in SSR environment')
  }
  
  const { gunzip } = await import('zlib')
  const { promisify } = await import('util')
  const gunzipAsync = promisify(gunzip)
  
  const decompressed = await gunzipAsync(Buffer.from(buffer))
  return decompressed.toString('utf-8')
}

/**
 * ArrayBufferからJSONオブジェクトを解析（自動圧縮解除）
 * CloudFlare KV用の統一ヘルパー関数
 */
export async function parseBufferAsJSON<T = any>(buffer: ArrayBuffer): Promise<T | null> {
  try {
    const uint8Data = new Uint8Array(buffer)
    
    if (isGzipped(uint8Data)) {
      // gzip圧縮されている場合はSSRで解凍
      const decompressed = await decompressGzipInSSR(buffer)
      return JSON.parse(decompressed) as T
    } else {
      // 圧縮されていない場合は直接パース
      const jsonString = new TextDecoder().decode(uint8Data)
      return JSON.parse(jsonString) as T
    }
  } catch (error) {
    // パースエラーの場合はnullを返す
    return null
  }
}