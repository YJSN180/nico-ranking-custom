import { test, expect } from '@playwright/test'

test.describe('カスタムランキング - baseGenreリダイレクト', () => {
  test('カスタムランキング選択時にbaseGenreページにリダイレクトされる', async ({ page }) => {
    console.log('🧪 カスタムランキングbaseGenreリダイレクトテスト開始')
    
    // カスタムランキングデータを準備
    await page.addInitScript(() => {
      const customRanking = {
        version: "1.0",
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
          },
          {
            id: "test-music-ranking",
            title: "テスト用音楽ランキング",
            baseGenre: "music",
            conditions: [
              {
                tag: "歌ってみた",
                operator: "AND",
                tagType: "both"
              }
            ],
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
    
    // ジャンルセレクターを開く
    // まず現在選択されているジャンルボタンを探す
    const selectedGenreButton = page.locator('button[aria-pressed="true"], button.selected').first()
    await selectedGenreButton.click()
    console.log('📱 ジャンルセレクターを開きました')
    await page.waitForTimeout(500)
    
    // カスタムジャンルボタンをクリック
    const customGenreButton = page.locator('button').filter({ hasText: 'カスタム' })
    await customGenreButton.click()
    console.log('🎯 カスタムジャンルを選択')
    await page.waitForTimeout(1000)
    
    // ゲームカスタムランキングを選択
    const gameCustomRanking = page.locator('button').filter({ hasText: 'テスト用ゲームランキング' })
    await gameCustomRanking.click()
    console.log('🎮 ゲームカスタムランキングを選択')
    await page.waitForTimeout(2000)
    
    // URLがゲームジャンルになっていることを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    expect(currentUrl).toContain('genre=game')
    expect(currentUrl).not.toContain('genre=custom')
    
    // APIリクエストでgameジャンルのデータが取得されたことを確認
    const gameApiRequest = apiRequests.find(url => url.includes('genre=game'))
    expect(gameApiRequest).toBeTruthy()
    console.log('✅ ゲームジャンルのAPIリクエストを確認:', gameApiRequest)
    
    // 別のカスタムランキング（音楽）を選択
    const selectedButton = page.locator('button[aria-pressed="true"]').first()
    await selectedButton.click()
    await page.waitForTimeout(500)
    
    const customButton2 = page.locator('button').filter({ hasText: 'カスタム' })
    await customButton2.click()
    await page.waitForTimeout(500)
    
    const musicCustomRanking = page.locator('button').filter({ hasText: 'テスト用音楽ランキング' })
    await musicCustomRanking.click()
    console.log('🎵 音楽カスタムランキングを選択')
    await page.waitForTimeout(2000)
    
    // URLが音楽ジャンルになっていることを確認
    const newUrl = page.url()
    console.log('📍 新しいURL:', newUrl)
    expect(newUrl).toContain('genre=music')
    expect(newUrl).not.toContain('genre=custom')
    
    // APIリクエストでmusicジャンルのデータが取得されたことを確認
    const musicApiRequest = apiRequests.find(url => url.includes('genre=music'))
    expect(musicApiRequest).toBeTruthy()
    console.log('✅ 音楽ジャンルのAPIリクエストを確認:', musicApiRequest)
    
    console.log('🎉 カスタムランキングbaseGenreリダイレクトテスト完了')
  })
})