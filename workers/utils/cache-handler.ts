/**
 * Worker Cache API Handler
 * CloudflareのCache APIを使用してWorker内でキャッシュを管理
 *
 * Cache Rulesが効かない問題の解決策
 * Worker RouteがCache Rulesより優先されるため、Worker内部でキャッシュを実装
 */

export interface CacheOptions {
  cacheTTL: number      // キャッシュ有効期限（秒）
  cacheKeyPrefix?: string // キャッシュキーのプレフィックス
  bypassCache?: boolean // キャッシュをバイパスするか
}

/**
 * キャッシュキーを生成
 */
export function generateCacheKey(url: URL, prefix: string = 'v1'): Request {
  // クエリパラメータをソートして一貫性を保つ
  const sortedParams = new URLSearchParams(url.searchParams)
  sortedParams.sort()

  const cacheUrl = new URL(url.pathname + '?' + sortedParams.toString(), url.origin)
  return new Request(cacheUrl.toString(), { method: 'GET' })
}

/**
 * キャッシュから取得
 */
export async function getFromCache(
  url: URL,
  options: CacheOptions
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
        const age = Math.floor((Date.now() - new Date(cacheDate).getTime()) / 1000)

        // TTLを超えていない場合はキャッシュを返す
        if (age < options.cacheTTL) {
          // ヘッダーを追加して返す
          const headers = new Headers(cached.headers)
          headers.set('X-Cache-Status', 'HIT')
          headers.set('Age', age.toString())
          headers.set('X-Cache-TTL', options.cacheTTL.toString())

          return new Response(cached.body, {
            status: cached.status,
            headers
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
 */
export async function saveToCache(
  url: URL,
  response: Response,
  options: CacheOptions,
  ctx: ExecutionContext
): Promise<void> {
  if (options.bypassCache) return
  if (response.status !== 200) return // エラーレスポンスはキャッシュしない

  const cache = caches.default
  const cacheKey = generateCacheKey(url, options.cacheKeyPrefix)

  // キャッシュ用のヘッダーを準備
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', `public, max-age=${options.cacheTTL}`)
  headers.set('X-Cache-Status', 'MISS') // 初回は常にMISS

  const cacheResponse = new Response(response.body, {
    status: response.status,
    headers
  })

  // バックグラウンドでキャッシュに保存
  ctx.waitUntil(
    cache.put(cacheKey, cacheResponse).catch(error => {
      console.error('Cache save error:', error)
    })
  )
}

/**
 * キャッシュを削除
 */
export async function purgeCache(
  url: URL,
  options: { cacheKeyPrefix?: string } = {}
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
      cacheTTL: 1200,  // 20分（GitHub Actions実行間隔に合わせる）
      cacheKeyPrefix: 'ranking-v1',
      bypassCache: url.searchParams.get('nocache') === 'true'
    }
  }

  if (path.includes('/api/tags/autocomplete')) {
    return {
      cacheTTL: 1800,  // 30分（タグデータは比較的安定）
      cacheKeyPrefix: 'tags-v1',
      bypassCache: false
    }
  }

  if (path.includes('/api/thumbnail')) {
    return {
      cacheTTL: 86400,  // 24時間（サムネイルは変更頻度が低い）
      cacheKeyPrefix: 'thumb-v1',
      bypassCache: false
    }
  }

  // デフォルト
  return {
    cacheTTL: 300,  // 5分
    cacheKeyPrefix: 'default-v1',
    bypassCache: false
  }
}

/**
 * 統合キャッシュハンドラー
 */
export async function handleWithCache(
  url: URL,
  fetchFunction: () => Promise<Response>,
  ctx: ExecutionContext
): Promise<Response> {
  const options = getRankingCacheOptions(url)

  // キャッシュから取得を試みる
  const cached = await getFromCache(url, options)
  if (cached) {
    console.log(`[Cache] HIT for ${url.pathname}`)
    return cached
  }

  console.log(`[Cache] MISS for ${url.pathname}`)

  // オリジンから取得
  const response = await fetchFunction()

  // レスポンスを複製（saveToCache用）
  const responseToCache = response.clone()

  // キャッシュに保存（バックグラウンド）
  ctx.waitUntil(
    saveToCache(url, responseToCache, options, ctx)
  )

  // MISSヘッダーを追加して返す
  const headers = new Headers(response.headers)
  headers.set('X-Cache-Status', 'MISS')

  return new Response(response.body, {
    status: response.status,
    headers
  })
}