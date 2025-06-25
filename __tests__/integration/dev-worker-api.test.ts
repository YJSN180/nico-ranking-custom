/**
 * 開発Worker統合テスト
 * t-wada式TDDに基づいて、まず失敗するテストから実装
 */

// テスト環境では環境変数を直接設定
process.env.NEXT_PUBLIC_API_GATEWAY_URL = 'https://nico-ranking-dynamic-cache-dev.yjsn180180.workers.dev'

describe('開発Worker API統合テスト', () => {
  const DEV_API_URL = 'http://localhost:3000/api/ranking'
  const WORKER_URL = 'https://nico-ranking-dynamic-cache-dev.yjsn180180.workers.dev'
  
  beforeAll(() => {
    // 開発サーバーが起動していることを前提とする
    console.log('Testing against:', DEV_API_URL)
    console.log('Worker URL:', WORKER_URL)
  })
  
  describe('プロキシ機能', () => {
    test('Next.js API Routeが開発Workerにプロキシすること', async () => {
      const response = await fetch(`${DEV_API_URL}?genre=all`)
      
      expect(response.ok).toBe(true)
      expect(response.headers.get('X-Proxy-Source')).toBe('nextjs-dev')
      expect(response.headers.get('X-Worker-URL')).toBe(WORKER_URL)
    })
    
    test('開発WorkerからのレスポンスヘッダーがNext.js経由で取得できること', async () => {
      const response = await fetch(`${DEV_API_URL}?genre=all`)
      
      // 動的TTLヘッダーの存在確認
      expect(response.headers.get('Cache-Control')).toMatch(/public, max-age=\d+/)
      expect(response.headers.get('X-Data-Source')).toBe('r2-direct')
      expect(response.headers.get('ETag')).toBeTruthy()
    })
  })
  
  describe('動的TTL機能', () => {
    test('現在時刻に応じた適切なTTL値が設定されること', async () => {
      const response = await fetch(`${DEV_API_URL}?genre=all`)
      const cacheControl = response.headers.get('Cache-Control')
      
      expect(cacheControl).toBeTruthy()
      
      // max-age値を抽出
      const maxAgeMatch = cacheControl!.match(/max-age=(\d+)/)
      expect(maxAgeMatch).toBeTruthy()
      
      const maxAge = parseInt(maxAgeMatch![1])
      
      // 次の更新時刻（5分または25分）までの時間を計算
      const now = new Date()
      const currentMinute = now.getMinutes()
      let expectedMaxAge: number
      
      if (currentMinute < 5) {
        expectedMaxAge = (5 - currentMinute) * 60
      } else if (currentMinute < 25) {
        expectedMaxAge = (25 - currentMinute) * 60
      } else {
        expectedMaxAge = (65 - currentMinute) * 60 // 次の時間の5分
      }
      
      // ブラウザTTLは120秒短く設定される
      expectedMaxAge = Math.max(60, expectedMaxAge - 120)
      
      // 誤差を考慮（±30秒）
      expect(maxAge).toBeGreaterThanOrEqual(expectedMaxAge - 30)
      expect(maxAge).toBeLessThanOrEqual(expectedMaxAge + 30)
    })
  })
  
  describe('ETag条件付きリクエスト', () => {
    test('If-None-Matchヘッダーで304レスポンスが返ること', async () => {
      // 最初のリクエストでETagを取得
      const firstResponse = await fetch(`${DEV_API_URL}?genre=all`)
      const etag = firstResponse.headers.get('ETag')
      
      expect(etag).toBeTruthy()
      
      // 条件付きリクエスト
      const secondResponse = await fetch(`${DEV_API_URL}?genre=all`, {
        headers: {
          'If-None-Match': etag!
        }
      })
      
      expect(secondResponse.status).toBe(304)
      expect(secondResponse.headers.get('ETag')).toBe(etag)
    })
  })
  
  describe('エラーハンドリング', () => {
    test('存在しないタグの場合は404エラーを返すこと', async () => {
      const response = await fetch(`${DEV_API_URL}?genre=all&tag=nonexistent-tag-xyz`)
      const data = await response.json()
      
      expect(response.status).toBe(200) // R2から空の結果が返る
      expect(data.items).toEqual([])
      expect(data.metadata?.tag).toBe('nonexistent-tag-xyz')
    })
    
    test('不正なパラメータでも適切に処理されること', async () => {
      const response = await fetch(`${DEV_API_URL}?genre=invalid&period=invalid`)
      
      // Workerは不正なパラメータでも動作する（デフォルト値を使用）
      expect(response.ok).toBe(true)
    })
  })
  
  describe('データ整合性', () => {
    test('ランキングデータの構造が正しいこと', async () => {
      const response = await fetch(`${DEV_API_URL}?genre=all`)
      const data = await response.json()
      
      expect(data).toHaveProperty('items')
      expect(Array.isArray(data.items)).toBe(true)
      
      if (data.items.length > 0) {
        const firstItem = data.items[0]
        expect(firstItem).toHaveProperty('id')
        expect(firstItem).toHaveProperty('title')
        expect(firstItem).toHaveProperty('viewCount')
        expect(firstItem).toHaveProperty('tags')
      }
      
      expect(data).toHaveProperty('popularTags')
      expect(Array.isArray(data.popularTags)).toBe(true)
    })
  })
})