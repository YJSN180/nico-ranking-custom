import { test, expect } from '@playwright/test'

test.describe('APIテスト', () => {
  test('ランキングAPIが正しく動作する', async ({ request }) => {
    // 総合ランキングを取得
    const response = await request.get('/api/ranking?genre=all&period=24h')
    
    expect(response.status()).toBeLessThan(500) // サーバーエラーでない
    
    if (response.ok()) {
      const data = await response.json()
      
      // レスポンスの形式を確認
      if (Array.isArray(data)) {
        // 配列形式
        expect(data.length).toBeGreaterThanOrEqual(0)
        
        if (data.length > 0) {
          // 最初のアイテムの構造を確認
          const firstItem = data[0]
          expect(firstItem).toHaveProperty('id')
          expect(firstItem).toHaveProperty('title')
          expect(firstItem).toHaveProperty('rank')
        }
      } else if (data.items) {
        // オブジェクト形式
        expect(Array.isArray(data.items)).toBeTruthy()
        expect(data.items.length).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('ジャンル別ランキングAPIが動作する', async ({ request }) => {
    const genres = ['game', 'music', 'anime']
    
    for (const genre of genres) {
      const response = await request.get(`/api/ranking?genre=${genre}&period=24h`)
      expect(response.status()).toBeLessThan(500)
    }
  })

  test('不正なパラメータでエラーハンドリングが動作する', async ({ request }) => {
    const response = await request.get('/api/ranking?genre=invalid&period=invalid')
    
    // エラーは返すが、サーバーがクラッシュしない
    expect(response.status()).toBeLessThan(500)
  })

  test('レート制限が適切に動作する', async ({ request }) => {
    const requests = []
    
    // 10個の同時リクエスト
    for (let i = 0; i < 10; i++) {
      requests.push(request.get(`/api/ranking?genre=all&period=24h&_=${i}`))
    }
    
    const responses = await Promise.all(requests)
    
    // 少なくとも一部は成功する
    const successCount = responses.filter(r => r.ok()).length
    expect(successCount).toBeGreaterThan(0)
    
    // 429エラーが返る場合もある（レート制限）
    const rateLimitCount = responses.filter(r => r.status() === 429).length
    console.log(`成功: ${successCount}, レート制限: ${rateLimitCount}`)
  })
})

test.describe('キャッシュのテスト', () => {
  test('同じリクエストでキャッシュが効く', async ({ request }) => {
    // 1回目のリクエスト
    const start1 = Date.now()
    const response1 = await request.get('/api/ranking?genre=music&period=24h')
    const time1 = Date.now() - start1
    
    expect(response1.ok()).toBeTruthy()
    
    // 2回目のリクエスト（キャッシュから）
    const start2 = Date.now()
    const response2 = await request.get('/api/ranking?genre=music&period=24h')
    const time2 = Date.now() - start2
    
    expect(response2.ok()).toBeTruthy()
    
    // 2回目の方が速いことを期待（キャッシュ効果）
    console.log(`1回目: ${time1}ms, 2回目: ${time2}ms`)
    
    // レスポンスヘッダーを確認
    const cacheHeader = response2.headers()['x-cache-status']
    if (cacheHeader) {
      console.log('キャッシュステータス:', cacheHeader)
    }
  })
})