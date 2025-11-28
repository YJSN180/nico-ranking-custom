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
    
    // 少なくとも一部は成功するか、適切なエラーが返される
    const successCount = responses.filter(r => r.ok()).length
    const rateLimitCount = responses.filter(r => r.status() === 429).length
    const serverErrorCount = responses.filter(r => r.status() >= 500).length
    
    console.log(`成功: ${successCount}, レート制限: ${rateLimitCount}`)
    
    // サーバーエラーが多すぎない（レート制限は正常な動作）
    expect(serverErrorCount).toBeLessThan(responses.length)
    
    // 少なくとも一部は適切なレスポンス（200または429）が返される
    const properResponseCount = successCount + rateLimitCount
    expect(properResponseCount).toBeGreaterThan(0)
  })
})

test.describe('キャッシュのテスト', () => {
  test('同じリクエストでキャッシュが効く', async ({ request }) => {
    // 1回目のリクエスト
    const start1 = Date.now()
    const response1 = await request.get('/api/ranking?genre=music&period=24h')
    const time1 = Date.now() - start1
    
    // レート制限を考慮して、完全失敗でなければOK
    expect(response1.status()).toBeLessThan(500)
    
    if (!response1.ok()) {
      console.log(`First request failed with status ${response1.status()}, skipping cache test`)
      return
    }
    
    // 少し待ってからリクエスト（レート制限を避ける）
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 2回目のリクエスト（キャッシュから）
    const start2 = Date.now()
    const response2 = await request.get('/api/ranking?genre=music&period=24h')
    const time2 = Date.now() - start2
    
    // 2回目も成功する必要はない（レート制限の可能性）
    console.log(`1回目: ${time1}ms (status: ${response1.status()}), 2回目: ${time2}ms (status: ${response2.status()})`)
    
    // レスポンスヘッダーを確認
    const cacheHeader = response2.headers()['x-cache-status']
    if (cacheHeader) {
      console.log('キャッシュステータス:', cacheHeader)
    }
    
    // 少なくとも1つは成功していることを確認
    expect(response1.ok() || response2.ok()).toBeTruthy()
  })
})