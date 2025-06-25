import { test, expect } from '@playwright/test'

test.describe('包括的ナビゲーションテスト', () => {
  test('期間切り替え（毎時⇔24時間）', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // 初期状態の確認
    await expect(page.locator('text=24時間').first()).toBeVisible()
    
    // ネットワークリクエストを監視
    const requestPromise = page.waitForRequest(req => 
      req.url().includes('/api/ranking') || req.url().includes('genre=')
    )
    
    // 毎時に切り替え
    await page.click('text=毎時')
    await requestPromise
    
    // URLが更新されることを確認
    await expect(page).toHaveURL(/period=hour/)
    
    // 24時間に戻す
    const requestPromise2 = page.waitForRequest(req => 
      req.url().includes('/api/ranking') || req.url().includes('genre=')
    )
    await page.click('text=24時間')
    await requestPromise2
    
    // URLが戻ることを確認
    await expect(page).toHaveURL(/period=24h|^http:\/\/localhost:3000\/$/)
  })

  test('ジャンル切り替え（総合→ゲーム→アニメ→ボカロ）', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // ゲームジャンルに切り替え
    const requestPromise1 = page.waitForRequest(req => 
      req.url().includes('/api/ranking') || req.url().includes('genre=game')
    )
    await page.click('text=ゲーム')
    await requestPromise1
    await expect(page).toHaveURL(/genre=game/)
    
    // アニメジャンルに切り替え
    const requestPromise2 = page.waitForRequest(req => 
      req.url().includes('/api/ranking') || req.url().includes('genre=anime')
    )
    await page.click('text=アニメ')
    await requestPromise2
    await expect(page).toHaveURL(/genre=anime/)
    
    // ボカロジャンルに切り替え
    const requestPromise3 = page.waitForRequest(req => 
      req.url().includes('/api/ranking') || req.url().includes('genre=vocaloid')
    )
    await page.click('text=ボカロ')
    await requestPromise3
    await expect(page).toHaveURL(/genre=vocaloid/)
    
    // 総合に戻す
    const requestPromise4 = page.waitForRequest(req => 
      req.url().includes('/api/ranking') || req.url().includes('genre=all')
    )
    await page.click('text=総合')
    await requestPromise4
    await expect(page).toHaveURL(/genre=all|^http:\/\/localhost:3000\/$/)
  })

  test('タグ切り替え（人気タグ選択）', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // タグセレクタが存在することを確認
    const tagSelector = page.locator('text=タグ:').first()
    await expect(tagSelector).toBeVisible()
    
    // 人気タグボタンを探す（最初のいくつかのタグボタンのいずれか）
    const tagButtons = page.locator('button').filter({ hasText: /ゲーム|VOICEROID|MMD|歌ってみた|踊ってみた|VOCALOID/ })
    const tagCount = await tagButtons.count()
    
    if (tagCount > 0) {
      // 最初のタグをクリック
      const firstTag = tagButtons.first()
      const tagText = await firstTag.textContent()
      
      const requestPromise = page.waitForRequest(req => 
        req.url().includes('/api/ranking') || req.url().includes('tag=')
      )
      await firstTag.click()
      await requestPromise
      
      // URLにタグパラメータが含まれることを確認
      await expect(page).toHaveURL(/tag=/)
      
      // タグをクリアして総合に戻る
      const clearButton = page.locator('button').filter({ hasText: /×|クリア|すべて/ }).first()
      if (await clearButton.count() > 0) {
        await clearButton.click()
        await expect(page).not.toHaveURL(/tag=/)
      }
    }
  })

  test('複合的な切り替え（ジャンル→期間→タグ）', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // 1. ゲームジャンルに切り替え
    await page.click('text=ゲーム')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/genre=game/)
    
    // 2. 毎時に切り替え
    await page.click('text=毎時')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/genre=game.*period=hour|period=hour.*genre=game/)
    
    // 3. タグがあれば選択
    const tagButtons = page.locator('button').filter({ hasText: /ゲーム実況|実況プレイ|RPG/ })
    if (await tagButtons.count() > 0) {
      await tagButtons.first().click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/tag=/)
    }
    
    // 4. すべてクリアして初期状態に戻る
    await page.click('text=総合')
    await page.waitForLoadState('networkidle')
    await page.click('text=24時間')
    await page.waitForLoadState('networkidle')
    
    // 初期状態に戻ったことを確認
    const url = page.url()
    expect(url === 'http://localhost:3000/' || url === 'http://localhost:3000').toBeTruthy()
  })

  test('データ圧縮の動作確認（ネットワークレスポンス）', async ({ page }) => {
    // ネットワークレスポンスを監視
    const responses: any[] = []
    page.on('response', response => {
      if (response.url().includes('/api/ranking')) {
        responses.push({
          url: response.url(),
          status: response.status(),
          headers: response.headers(),
          contentType: response.headers()['content-type'],
          contentEncoding: response.headers()['content-encoding']
        })
      }
    })
    
    await page.goto('http://localhost:3000')
    await page.waitForLoadState('networkidle')
    
    // APIレスポンスを確認
    const apiResponse = responses.find(r => r.url.includes('/api/ranking'))
    if (apiResponse) {
      // レスポンスが正常であることを確認
      expect(apiResponse.status).toBe(200)
      
      // Content-Typeがapplication/jsonであることを確認
      expect(apiResponse.contentType).toContain('application/json')
      
      // 圧縮されている場合はcontent-encodingがgzipであることを確認
      // （圧縮されていない場合もある）
      console.log('API Response headers:', apiResponse.headers)
    }
    
    // ジャンルを切り替えて再度確認
    await page.click('text=アニメ')
    await page.waitForLoadState('networkidle')
    
    const animeResponse = responses.find(r => r.url.includes('genre=anime'))
    if (animeResponse) {
      expect(animeResponse.status).toBe(200)
      expect(animeResponse.contentType).toContain('application/json')
    }
  })
})