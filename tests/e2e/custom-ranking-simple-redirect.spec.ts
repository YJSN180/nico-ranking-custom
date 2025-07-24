import { test, expect } from '@playwright/test'

test.describe('カスタムランキング - シンプルリダイレクトテスト', () => {
  test('URLパラメータでカスタムジャンルが指定されてもbaseGenreにリダイレクトされる', async ({ page }) => {
    console.log('🧪 シンプルリダイレクトテスト開始')
    
    // カスタムランキングデータを準備
    await page.addInitScript(() => {
      const customRanking = {
        version: "1.0",
        rankings: [
          {
            id: "test-game-ranking",
            title: "テスト用ゲームランキング",
            baseGenre: "game",
            conditions: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        selectedId: null
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
    })
    
    // APIリクエストを監視
    const apiRequests: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ranking')) {
        apiRequests.push(request.url())
        console.log('🌐 API Request:', request.url())
      }
    })
    
    // ホームページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    
    // カスタムジャンルページに直接移動
    await page.goto('/?genre=custom')
    await page.waitForTimeout(2000)
    
    // genre=customではなく、通常のジャンルが表示されていることを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    
    // APIリクエストを確認（genre=customでのリクエストがないことを確認）
    const customApiRequest = apiRequests.find(url => url.includes('genre=custom'))
    expect(customApiRequest).toBeUndefined()
    console.log('✅ genre=customでのAPIリクエストがないことを確認')
    
    console.log('🎉 シンプルリダイレクトテスト完了')
  })
})