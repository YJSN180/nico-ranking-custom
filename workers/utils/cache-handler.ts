/**
 * Worker Cache API Handler
 * CloudflareのCache APIを使用してWorker内でキャッシュを管理
 *
 * Cache Rulesが効かない問題の解決策
 * Worker RouteがCache Rulesより優先されるため、Worker内部でキャッシュを実装
 */

export interface CacheOptions {
  cacheTTL: number // キャッシュ有効期限（秒）
  cacheKeyPrefix?: string // キャッシュキーのプレフィックス
  bypassCache?: boolean // キャッシュをバイパスするか
}

// gzip magic bytes: 0x1f, 0x8b
const GZIP_MAGIC_BYTE_1 = 0x1f
const GZIP_MAGIC_BYTE_2 = 0x8b

/**
 * データがgzip圧縮されているかチェック
 * @param data ArrayBuffer または Uint8Array
 * @returns gzip圧縮されている場合はtrue
 */
export function isGzipData(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  if (bytes.length < 2) return false
  return bytes[0] === GZIP_MAGIC_BYTE_1 && bytes[1] === GZIP_MAGIC_BYTE_2
}

/**
 * キャッシュキーを生成
 */
export function generateCacheKey(url: URL, prefix: string = 'v1'): Request {
  // クエリパラメータをソートして一貫性を保つ
  const sortedParams = new URLSearchParams(url.searchParams)
  sortedParams.sort()

  const cacheUrl = new URL(
    url.pathname + '?' + sortedParams.toString(),
    url.origin,
  )
  return new Request(cacheUrl.toString(), { method: 'GET' })
}

/**
 * キャッシュから取得
 * gzip圧縮データの場合はContent-Encodingヘッダーを適切に設定
 */
export async function getFromCache(
  url: URL,
  options: CacheOptions,
): Promise<Response | null> {
  if (options.bypassCache) return null

  const cache = caches.default
  const cacheKey = generateCacheKey(url, options.cacheKeyPrefix)

  try {
    const cached = await cache.match(cacheKey)

    if (cached) {
      // キャッシュの年齢を計算
      const cacheDate = cached.headers.get('date')
      if (cacheDate) {
        const age = Math.floor(
          (Date.now() - new Date(cacheDate).getTime()) / 1000,
        )

        // TTLを超えていない場合はキャッシュを返す
        if (age < options.cacheTTL) {
          // ヘッダーを追加して返す
          const headers = new Headers(cached.headers)
          headers.set('X-Cache-Status', 'HIT')
          headers.set('Age', age.toString())
          headers.set('X-Cache-TTL', options.cacheTTL.toString())

          // ボディを読み取ってgzip判定を行う
          const cachedBody = await cached.arrayBuffer()

          // gzip圧縮データかどうかをチェック
          if (isGzipData(cachedBody)) {
            // gzipデータの場合はContent-Encodingを設定
            headers.set('Content-Encoding', 'gzip')
            headers.set('X-Data-Encoding', 'gzip')
          } else {
            // 非圧縮データの場合はContent-Encodingを削除
            headers.delete('Content-Encoding')
            headers.set('X-Data-Encoding', 'identity')
          }

          return new Response(cachedBody, {
            status: cached.status,
            headers,
          })
        }
      }
    }
  } catch (error) {
    console.error('Cache retrieval error:', error)
  }

  return null
}

/**
 * キャッシュに保存
 * gzip圧縮データの場合はContent-Encodingヘッダーを適切に設定
 */
export async function saveToCache(
  url: URL,
  response: Response,
  options: CacheOptions,
  ctx: ExecutionContext,
): Promise<void> {
  if (options.bypassCache) return
  if (response.status !== 200) return // エラーレスポンスはキャッシュしない

  const cache = caches.default
  const cacheKey = generateCacheKey(url, options.cacheKeyPrefix)

  // レスポンスボディを読み取ってgzip判定を行う
  const responseBody = await response.arrayBuffer()

  // キャッシュ用のヘッダーを準備
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'public, max-age=' + options.cacheTTL)
  headers.set('X-Cache-Status', 'MISS') // 初回は常にMISS

  // gzip圧縮データかどうかをチェックしてヘッダーを設定
  if (isGzipData(responseBody)) {
    headers.set('Content-Encoding', 'gzip')
    headers.set('X-Data-Encoding', 'gzip')
    console.log('[Cache] Saving gzip-compressed data to cache')
  } else {
    // 非圧縮データの場合はContent-Encodingを削除
    headers.delete('Content-Encoding')
    headers.set('X-Data-Encoding', 'identity')
    console.log('[Cache] Saving uncompressed data to cache')
  }

  const cacheResponse = new Response(responseBody, {
    status: response.status,
    headers,
  })

  // バックグラウンドでキャッシュに保存
  ctx.waitUntil(
    cache.put(cacheKey, cacheResponse).catch((error) => {
      console.error('Cache save error:', error)
    }),
  )
}

/**
 * キャッシュを削除
 */
export async function purgeCache(
  url: URL,
  options: { cacheKeyPrefix?: string } = {},
): Promise<boolean> {
  const cache = caches.default
  const cacheKey = generateCacheKey(url, options.cacheKeyPrefix)

  try {
    return await cache.delete(cacheKey)
  } catch (error) {
    console.error('Cache purge error:', error)
    return false
  }
}

/**
 * ランキングAPIのキャッシュ設定を取得
 */
export function getRankingCacheOptions(url: URL): CacheOptions {
  const path = url.pathname

  // パスに応じてTTLを設定
  if (path.includes('/api/ranking')) {
    return {
      cacheTTL: 0,
      cacheKeyPrefix: 'ranking-bypass',
      bypassCache: true,
    }
  }

  if (path.includes('/api/tags/autocomplete')) {
    return {
      cacheTTL: 1800, // 30分（タグデータは比較的安定）
      cacheKeyPrefix: 'tags-v1',
      bypassCache: false,
    }
  }

  if (path.includes('/api/thumbnail')) {
    return {
      cacheTTL: 86400, // 24時間（サムネイルは変更頻度が低い）
      cacheKeyPrefix: 'thumb-v1',
      bypassCache: false,
    }
  }

  // デフォルト
  return {
    cacheTTL: 300, // 5分
    cacheKeyPrefix: 'default-v1',
    bypassCache: false,
  }
}

/**
 * 統合キャッシュハンドラー
 * gzip圧縮データを適切に処理
 */
export async function handleWithCache(
  url: URL,
  fetchFunction: () => Promise<Response>,
  ctx: ExecutionContext,
): Promise<Response> {
  const options = getRankingCacheOptions(url)

  // キャッシュから取得を試みる
  const cached = await getFromCache(url, options)
  if (cached) {
    console.log('[Cache] HIT for ' + url.pathname)
    return cached
  }

  console.log('[Cache] MISS for ' + url.pathname)

  // オリジンから取得
  const response = await fetchFunction()

  // レスポンスを複製してボディを読み取る
  const responseBody = await response.arrayBuffer()

  // gzip判定を行い適切なヘッダーを設定
  const headers = new Headers(response.headers)
  headers.set('X-Cache-Status', 'MISS')

  if (isGzipData(responseBody)) {
    headers.set('Content-Encoding', 'gzip')
    headers.set('X-Data-Encoding', 'gzip')
  } else {
    headers.delete('Content-Encoding')
    headers.set('X-Data-Encoding', 'identity')
  }

  // キャッシュに保存（バックグラウンド）
  const cacheResponse = new Response(responseBody, {
    status: response.status,
    headers: new Headers(headers),
  })

  ctx.waitUntil(saveToCache(url, cacheResponse.clone(), options, ctx))

  return new Response(responseBody, {
    status: response.status,
    headers,
  })
}
