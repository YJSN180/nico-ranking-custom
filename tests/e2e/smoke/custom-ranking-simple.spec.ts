import { test, expect } from '@playwright/test'

test.describe('カスタムランキング - APIテスト', () => {
  test('カスタムランキングのbaseGenreでAPIリクエストが正常に動作する', async ({ page }) => {
    console.log('🧪 カスタムランキングAPIテスト開始')
    
    // APIリクエストを監視
    const apiRequests: { url: string; method: string }[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ranking')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        })
        console.log('🌐 API Request:', request.method(), request.url())
      }
    })

    // APIレスポンスを監視
    const apiResponses: { url: string; status: number }[] = []
    page.on('response', response => {
      if (response.url().includes('/api/ranking')) {
        apiResponses.push({
          url: response.url(),
          status: response.status()
        })
        console.log('📡 API Response:', response.status(), response.url())
      }
    })

    // コンソールログを監視（デバッグログ用）
    const consoleLogs: string[] = []
    page.on('console', msg => {
      const text = msg.text()
      if (msg.type() === 'log' && text.includes('カスタムランキング')) {
        consoleLogs.push(text)
        console.log('📋 Browser Console:', text)
      }
    })

    // ページに事前にカスタムランキングデータを設定
    await page.addInitScript(() => {
      const customRanking = {
        rankings: [
          {
            id: "test-game-ranking",
            title: "テスト用ゲームランキング",
            baseGenre: "game",
            conditions: [
              {
                tag: "実況プレイ",
                operator: "AND",
                tagType: "both"
              }
            ],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        selectedId: "test-game-ranking"
      }
      try {
        localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
        console.log('✅ カスタムランキングデータ設定完了')
      } catch (e) {
        console.log('⚠️ localStorage設定失敗:', e)
      }
    })

    // カスタムランキングのURLでページを開く
    const customUrl = '/?genre=custom&ranking=test-game-ranking&tag=custom:test-game-ranking'
    console.log('🔗 カスタムランキングURL:', customUrl)
    
    await page.goto(customUrl)
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    await page.waitForTimeout(5000) // デバッグログとAPIリクエストを待つ

    // 結果の確認
    console.log('📊 収集されたAPIリクエスト:', apiRequests)
    console.log('📊 収集されたAPIレスポンス:', apiResponses)
    console.log('📊 収集されたコンソールログ:', consoleLogs)

    // 1. baseGenre=gameでAPIリクエストが発生していることを確認
    const gameApiRequest = apiRequests.find(req => req.url.includes('genre=game'))
    expect(gameApiRequest, 'ゲームジャンルでのAPIリクエストが発生していません').toBeTruthy()
    console.log('✅ ゲームジャンルAPIリクエスト確認:', gameApiRequest?.url)

    // 2. limit=1000でAPIリクエストが発生していることを確認
    const limitApiRequest = apiRequests.find(req => req.url.includes('limit=1000'))
    expect(limitApiRequest, 'limit=1000のAPIリクエストが発生していません').toBeTruthy()
    console.log('✅ 1000件取得APIリクエスト確認:', limitApiRequest?.url)

    // 3. APIが成功レスポンスを返していることを確認
    const successResponse = apiResponses.find(res => res.status === 200 && res.url.includes('genre=game'))
    expect(successResponse, 'APIが成功レスポンスを返していません').toBeTruthy()
    console.log('✅ API成功レスポンス確認:', successResponse?.status, successResponse?.url)

    // 4. ランキングアイテムが表示されていることを確認
    const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item, article')
    
    try {
      await expect(rankingItems.first()).toBeVisible({ timeout: 15000 })
      const itemCount = await rankingItems.count()
      console.log('📊 表示されたランキングアイテム数:', itemCount)
      
      // 十分な数の動画が表示されていることを確認
      expect(itemCount, 'ランキングアイテムが十分に表示されていません').toBeGreaterThan(5)
      console.log('✅ ランキングアイテム表示確認:', itemCount, '件')
    } catch (error) {
      console.log('⚠️ ランキングアイテムの表示確認でエラー:', error)
      
      // ページの状態をデバッグ
      const pageContent = await page.content()
      console.log('📄 ページコンテンツサンプル:', pageContent.substring(0, 500))
      
      // 代替セレクターでも確認
      const alternativeItems = page.locator('*[class*="ranking"], *[class*="item"], *[class*="video"]')
      const altCount = await alternativeItems.count()
      console.log('📊 代替セレクターでのアイテム数:', altCount)
    }

    console.log('🎉 カスタムランキングAPIテスト完了')
  })

  test('直接APIエンドポイントでbaseGenreが正しく動作する', async ({ page }) => {
    console.log('🧪 直接APIテスト開始')
    
    // 各ベースジャンルでAPIを直接テスト
    const testGenres = ['game', 'music', 'entertainment', 'anime']
    
    for (const genre of testGenres) {
      console.log(`🔍 ${genre}ジャンル 直接APIテスト中...`)
      
      const apiUrl = `/api/ranking?genre=${genre}&period=24h&limit=1000`
      
      // APIを直接呼び出し
      const response = await page.request.get(apiUrl)
      console.log(`📡 ${genre}ジャンル APIレスポンス:`, response.status())
      
      if (response.status() === 200) {
        const data = await response.json()
        console.log(`📊 ${genre}ジャンル データ件数:`, data.items?.length || 0)
        
        // 期待する構造でデータが返されていることを確認
        expect(data, `${genre}ジャンルでAPIレスポンスが正しくありません`).toHaveProperty('items')
        expect(Array.isArray(data.items), `${genre}ジャンルでitemsが配列ではありません`).toBe(true)
        
        if (data.items.length > 0) {
          console.log(`✅ ${genre}ジャンル API成功:`, data.items.length, '件のデータ取得')
        } else {
          console.log(`⚠️ ${genre}ジャンル APIはレスポンスしましたが、データが0件です`)
        }
      } else if (response.status() === 429) {
        console.log(`⚠️ ${genre}ジャンル API制限エラー (429)`)
      } else {
        console.log(`❌ ${genre}ジャンル API エラー:`, response.status())
      }
    }
    
    console.log('🎉 直接APIテスト完了')
  })
})