/**
 * Fast Origin Transfer最適化ユーティリティ
 * データ転送量を削減するための共通関数
 */

/**
 * 簡易的なETag生成（Edge Runtime対応）
 * MD5の代わりにDJB2ハッシュアルゴリズムを使用
 */
export function generateETag(data: string): string {
  let hash = 5381
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) + data.charCodeAt(i)
  }
  return `"${Math.abs(hash).toString(36)}"`
}

/**
 * 条件付きリクエストの処理
 * 304 Not Modifiedレスポンスで転送量を大幅削減
 */
export function handleConditionalRequest(
  request: Request,
  data: any,
  etag?: string
): Response | null {
  const dataStr = JSON.stringify(data)
  const currentEtag = etag || generateETag(dataStr)
  const ifNoneMatch = request.headers.get('if-none-match')

  if (ifNoneMatch === currentEtag) {
    return new Response(null, {
      status: 304,
      headers: {
        'etag': currentEtag,
        'cache-control': 'public, max-age=60, stale-while-revalidate=3600'
      }
    })
  }

  return null
}

/**
 * ページネーション処理
 * 大きなデータセットを分割して転送量を削減
 */
export interface PaginationOptions {
  limit?: number
  offset?: number
  page?: number
}

export function paginate<T>(
  items: T[],
  options: PaginationOptions
): {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
} {
  const limit = Math.min(options.limit || 30, 100) // 最大100件
  const page = options.page || 1
  const offset = options.offset !== undefined
    ? options.offset
    : (page - 1) * limit

  const paginatedItems = items.slice(offset, offset + limit)

  return {
    items: paginatedItems,
    total: items.length,
    limit,
    offset,
    hasMore: offset + limit < items.length
  }
}

/**
 * フィールド選択
 * 必要なフィールドのみを返すことで転送量を削減
 */
export function selectFields<T extends Record<string, any>>(
  items: T[],
  fields?: string
): Partial<T>[] {
  if (!fields) return items

  const fieldList = fields.split(',').map(f => f.trim())

  return items.map(item => {
    const filtered: Partial<T> = {}
    for (const field of fieldList) {
      if (field in item) {
        filtered[field as keyof T] = item[field as keyof T]
      }
    }
    return filtered
  })
}

/**
 * 最適化されたレスポンスヘッダー
 * キャッシュとCDNを最大限活用
 */
export function getOptimizedHeaders(
  etag?: string,
  maxAge: number = 60,
  sMaxAge: number = 3600
): HeadersInit {
  const headers: HeadersInit = {
    'content-type': 'application/json',
    'cache-control': `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=86400`,
    'cdn-cache-control': `max-age=${sMaxAge}, stale-while-revalidate=86400`,
    'vary': 'Accept-Encoding, Accept'
  }

  if (etag) {
    headers['etag'] = etag
  }

  return headers
}

/**
 * データサイズ推定（デバッグ用）
 * 転送量のモニタリング用
 */
export function estimateTransferSize(data: any): {
  raw: number
  json: number
  humanReadable: string
} {
  const jsonStr = JSON.stringify(data)
  const raw = new Blob([jsonStr]).size

  const humanReadable = raw < 1024
    ? `${raw} B`
    : raw < 1024 * 1024
    ? `${(raw / 1024).toFixed(2)} KB`
    : `${(raw / (1024 * 1024)).toFixed(2)} MB`

  return {
    raw,
    json: jsonStr.length,
    humanReadable
  }
}