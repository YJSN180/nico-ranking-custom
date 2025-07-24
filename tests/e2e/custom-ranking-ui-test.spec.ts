import { test, expect } from '@playwright/test'

test.describe('カスタムランキング - UI操作テスト', () => {
  test('カスタムランキング選択でbaseGenreにリダイレクト', async ({ page }) => {
    console.log('🧪 カスタムランキングUI操作テスト開始')
    
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
    console.log('📄 ホームページ読み込み完了')
    
    // ページのHTMLを確認してセレクター要素を探す
    const pageContent = await page.content()
    console.log('🔍 ジャンルセレクター要素を検索中...')
    
    // 実際のセレクター構造を確認
    const genreButtons = await page.locator('button').all()
    console.log(`📊 ページ内のボタン数: ${genreButtons.length}`)
    
    // ジャンルボタンのテキストを確認
    for (let i = 0; i < Math.min(genreButtons.length, 10); i++) {
      const text = await genreButtons[i].textContent()
      console.log(`  - ボタン${i}: "${text}"`)
    }
    
    // ヘッダー内の「すべて」ボタンをクリック（初期状態）
    const allButton = page.locator('button').filter({ hasText: /^すべて$/ }).first()
    if (await allButton.isVisible()) {
      await allButton.click()
      console.log('✅ 「すべて」ボタンをクリック')
      await page.waitForTimeout(500)
    }
    
    // カスタムボタンを探してクリック
    const customButton = page.locator('button').filter({ hasText: /^カスタム$/ })
    const customCount = await customButton.count()
    console.log(`📊 「カスタム」ボタン数: ${customCount}`)
    
    if (customCount > 0) {
      await customButton.first().click()
      console.log('✅ 「カスタム」ボタンをクリック')
      await page.waitForTimeout(1000)
      
      // カスタムランキングリストが表示されるのを待つ
      const customRankingButton = page.locator('button').filter({ hasText: 'テスト用ゲームランキング' })
      await expect(customRankingButton).toBeVisible({ timeout: 5000 })
      
      // カスタムランキングをクリック
      await customRankingButton.click()
      console.log('✅ 「テスト用ゲームランキング」をクリック')
      await page.waitForTimeout(2000)
      
      // URLを確認
      const currentUrl = page.url()
      console.log('📍 現在のURL:', currentUrl)
      
      // genre=gameになっていることを確認
      expect(currentUrl).toContain('genre=game')
      expect(currentUrl).not.toContain('genre=custom')
      
      // APIリクエストを確認
      const gameApiRequest = apiRequests.find(url => url.includes('genre=game'))
      expect(gameApiRequest).toBeTruthy()
      console.log('✅ ゲームジャンルのAPIリクエストを確認')
    } else {
      console.log('⚠️ カスタムボタンが見つかりません')
      // デバッグ情報を出力
      const navContent = await page.locator('nav').first().innerHTML()
      console.log('📋 ナビゲーション内容:', navContent.substring(0, 500))
    }
    
    console.log('🎉 カスタムランキングUI操作テスト完了')
  })
})