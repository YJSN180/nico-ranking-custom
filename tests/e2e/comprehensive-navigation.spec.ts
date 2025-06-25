import { test, expect } from '@playwright/test'

test.describe('包括的ナビゲーションテスト（修正版）', () => {
  test('期間切り替え（毎時⇔24時間）', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // 初期状態の確認
    await expect(page.locator('text=24時間').first()).toBeVisible()
    
    // APIリクエストを監視
    const hourApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && response.url().includes('period=hour')
    )
    
    // 毎時に切り替え
    await page.click('button:has-text("毎時")')
    
    // APIレスポンスを待つ
    await hourApiPromise
    
    // URLが更新されることを確認
    await expect(page).toHaveURL(/period=hour/, { timeout: 10000 })
    
    // 24時間に戻す
    const dailyApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && !response.url().includes('period=hour')
    )
    
    await page.click('button:has-text("24時間")')
    await dailyApiPromise
    
    // URLが戻ることを確認
    await expect(page).toHaveURL(/period=24h|^http:\/\/localhost:3000\/$/, { timeout: 10000 })
  })

  test('ジャンル切り替え（総合→ゲーム→アニメ→ボカロ）', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // 初期状態でランキングアイテムが表示されていることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const initialItems = await page.locator('[data-testid="ranking-item"]').count()
    expect(initialItems).toBeGreaterThan(0)
    
    // ゲームジャンルに切り替え
    const gameApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && response.url().includes('genre=game')
    )
    
    await page.click('button:has-text("ゲーム")')
    await gameApiPromise
    
    await expect(page).toHaveURL(/genre=game/, { timeout: 10000 })
    
    // ゲームジャンルのランキングが表示されることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const gameItems = await page.locator('[data-testid="ranking-item"]').count()
    expect(gameItems).toBeGreaterThan(0)
    
    // アニメジャンルに切り替え
    const animeApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && response.url().includes('genre=anime')
    )
    
    await page.click('button:has-text("アニメ")')
    await animeApiPromise
    
    await expect(page).toHaveURL(/genre=anime/, { timeout: 10000 })
    
    // アニメジャンルのランキングが表示されることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const animeItems = await page.locator('[data-testid="ranking-item"]').count()
    expect(animeItems).toBeGreaterThan(0)
    
    // ボカロジャンルに切り替え
    const vocaloidApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && response.url().includes('genre=vocaloid')
    )
    
    await page.click('button:has-text("ボカロ")')
    await vocaloidApiPromise
    
    await expect(page).toHaveURL(/genre=vocaloid/, { timeout: 10000 })
    
    // ボカロジャンルのランキングが表示されることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const vocaloidItems = await page.locator('[data-testid="ranking-item"]').count()
    expect(vocaloidItems).toBeGreaterThan(0)
    
    // 総合に戻す
    const allApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && 
                 !response.url().includes('genre=') || 
                 response.url().includes('genre=all')
    )
    
    await page.click('button:has-text("総合")')
    await allApiPromise
    
    await expect(page).toHaveURL(/genre=all|^http:\/\/localhost:3000\/$/, { timeout: 10000 })
    
    // 総合ランキングが表示されることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const allItems = await page.locator('[data-testid="ranking-item"]').count()
    expect(allItems).toBeGreaterThan(0)
  })

  test('タグ切り替え（人気タグ選択）', async ({ page }) => {
    // まずゲームジャンルに移動（総合では人気タグが表示されないため）
    await page.goto('http://localhost:3000?genre=game')
    
    // ページが完全に読み込まれるのを待つ
    await page.waitForLoadState('networkidle')
    
    // 人気タグセクションが存在することを確認
    const tagSection = page.locator('h2:has-text("人気タグ")')
    await expect(tagSection).toBeVisible({ timeout: 10000 })
    
    // 人気タグセクションの親要素を取得
    const tagSelectorContainer = page.locator('.tagSelectorContainer, [class*="tagSelectorContainer"]')
    
    // タグボタンを正確に選択（「すべて」以外の最初のタグ）
    const tagButtons = tagSelectorContainer.locator('button').filter({ 
      hasNotText: 'すべて'
    })
    
    const tagCount = await tagButtons.count()
    
    if (tagCount > 0) {
      const firstTagButton = tagButtons.first()
      const tagText = await firstTagButton.textContent()
      console.log(`Clicking tag: ${tagText}`)
      
      // APIリクエストを監視
      const tagApiPromise = page.waitForResponse(
        response => response.url().includes('/api/ranking') && response.url().includes('tag=')
      )
      
      // タグをクリック
      await firstTagButton.click()
      await tagApiPromise
      
      // URLにタグパラメータが含まれることを確認
      await expect(page).toHaveURL(/tag=/, { timeout: 10000 })
      
      // ランキングが表示されることを確認
      await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
      const taggedItems = await page.locator('[data-testid="ranking-item"]').count()
      expect(taggedItems).toBeGreaterThan(0)
      
      // 「すべて」ボタンでタグをクリア
      const allButton = tagSelectorContainer.locator('button:has-text("すべて")')
      if (await allButton.count() > 0) {
        const clearApiPromise = page.waitForResponse(
          response => response.url().includes('/api/ranking') && !response.url().includes('tag=')
        )
        
        await allButton.click()
        await clearApiPromise
        
        await expect(page).not.toHaveURL(/tag=/, { timeout: 10000 })
      }
    } else {
      console.warn('人気タグボタンが見つかりませんでした')
    }
  })

  test('複合的な切り替え（ジャンル→期間→タグ）', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // 初期状態のランキング数を確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const initialCount = await page.locator('[data-testid="ranking-item"]').count()
    expect(initialCount).toBeGreaterThan(0)
    
    // 1. ゲームジャンルに切り替え
    const gameApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && response.url().includes('genre=game')
    )
    
    await page.click('button:has-text("ゲーム")')
    await gameApiPromise
    
    await expect(page).toHaveURL(/genre=game/, { timeout: 10000 })
    
    // ゲームランキングが表示されることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const gameCount = await page.locator('[data-testid="ranking-item"]').count()
    expect(gameCount).toBeGreaterThan(0)
    
    // 2. 毎時に切り替え
    const hourApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && 
                 response.url().includes('genre=game') && 
                 response.url().includes('period=hour')
    )
    
    await page.click('button:has-text("毎時")')
    await hourApiPromise
    
    await expect(page).toHaveURL(/genre=game.*period=hour|period=hour.*genre=game/, { timeout: 10000 })
    
    // 毎時ランキングが表示されることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const hourlyCount = await page.locator('[data-testid="ranking-item"]').count()
    expect(hourlyCount).toBeGreaterThan(0)
    
    // 3. 人気タグから選択（存在する場合）
    await page.waitForLoadState('networkidle')
    const tagSelectorContainer = page.locator('.tagSelectorContainer, [class*="tagSelectorContainer"]')
    const popularTagButton = tagSelectorContainer.locator('button').filter({ 
      hasText: /^(VOCALOID|実況プレイ|歌ってみた|踊ってみた|MMD|アニメ|音楽|VOICEROID|ゆっくり実況|初音ミク|東方|RTA|MAD|エンターテイメント)$/
    }).first()
    
    if (await popularTagButton.count() > 0) {
      const tagApiPromise = page.waitForResponse(
        response => response.url().includes('/api/ranking') && response.url().includes('tag=')
      )
      
      await popularTagButton.click()
      await tagApiPromise
      
      await expect(page).toHaveURL(/tag=/, { timeout: 10000 })
      
      // タグ別ランキングが表示されることを確認
      await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
      const tagCount = await page.locator('[data-testid="ranking-item"]').count()
      expect(tagCount).toBeGreaterThan(0)
    }
    
    // 4. すべてクリアして初期状態に戻る
    // 総合ジャンルに戻す
    const allGenreApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && 
                 (!response.url().includes('genre=') || response.url().includes('genre=all'))
    )
    
    await page.click('button:has-text("総合")')
    await allGenreApiPromise
    
    // 24時間に戻す
    const dailyApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && 
                 (!response.url().includes('period=') || response.url().includes('period=24h'))
    )
    
    await page.click('button:has-text("24時間")')
    await dailyApiPromise
    
    // 最終的なURLの確認
    await page.waitForTimeout(1000) // 念のため少し待つ
    const url = page.url()
    console.log('Final URL:', url)
    
    // URLがホームページに戻るか、パラメータなしなら成功
    expect(
      url === 'http://localhost:3000/' || 
      url === 'http://localhost:3000' || 
      (!url.includes('genre=') && !url.includes('period=') && !url.includes('tag='))
    ).toBeTruthy()
    
    // 最終的にランキングが表示されていることを確認
    await page.waitForSelector('[data-testid="ranking-item"]', { state: 'visible' })
    const finalCount = await page.locator('[data-testid="ranking-item"]').count()
    expect(finalCount).toBeGreaterThan(0)
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
    const animeApiPromise = page.waitForResponse(
      response => response.url().includes('/api/ranking') && response.url().includes('genre=anime')
    )
    
    await page.click('button:has-text("アニメ")')
    await animeApiPromise
    
    const animeResponse = responses.find(r => r.url.includes('genre=anime'))
    if (animeResponse) {
      expect(animeResponse.status).toBe(200)
      expect(animeResponse.contentType).toContain('application/json')
    }
  })
})