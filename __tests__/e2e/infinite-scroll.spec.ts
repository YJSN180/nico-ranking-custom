import { test, expect } from '@playwright/test'

test.describe('Infinite Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // 初期読み込みを待つ
    await page.waitForSelector('[data-testid="ranking-item"]', { timeout: 10000 })
  })

  test('should load more items when scrolling down', async ({ page }) => {
    // 最初の50件が表示されることを確認
    const initialItems = await page.locator('[data-testid="ranking-item"]').count()
    expect(initialItems).toBe(50)
    
    // スクロールトリガーが表示されることを確認
    await expect(page.locator('[data-testid="scroll-trigger"]')).toBeVisible()
    
    // 一番下までスクロール
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    
    // 追加のアイテムが読み込まれるのを待つ
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('[data-testid="ranking-item"]')
      return items.length > 50
    }, { timeout: 5000 })
    
    // 100件表示されることを確認
    const afterScrollItems = await page.locator('[data-testid="ranking-item"]').count()
    expect(afterScrollItems).toBe(100)
  })

  test('should restore scroll position when navigating back', async ({ page }) => {
    // 100件まで読み込む
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('[data-testid="ranking-item"]')
      return items.length >= 100
    })
    
    // 特定の位置までスクロール
    await page.evaluate(() => window.scrollTo(0, 2000))
    await page.waitForTimeout(200) // スクロール位置が保存されるのを待つ
    
    // 動画リンクをクリック（同じタブで開く）
    const firstVideoLink = page.locator('[data-testid="ranking-item"] a').first()
    const videoUrl = await firstVideoLink.getAttribute('href')
    await firstVideoLink.click()
    
    // ニコニコ動画のページに遷移したことを確認
    await expect(page).toHaveURL(/nicovideo\.jp/)
    
    // ブラウザの戻るボタンで戻る
    await page.goBack()
    
    // スクロール位置が復元されることを確認
    await page.waitForFunction(() => window.scrollY > 1800 && window.scrollY < 2200, {
      timeout: 5000
    })
    
    const scrollPosition = await page.evaluate(() => window.scrollY)
    expect(scrollPosition).toBeGreaterThan(1800)
    expect(scrollPosition).toBeLessThan(2200)
  })

  test('should not open links in new tab', async ({ page, context }) => {
    // 現在のページ数を記録
    const initialPages = context.pages().length
    
    // 動画リンクをクリック
    await page.locator('[data-testid="ranking-item"] a').first().click()
    
    // 新しいタブが開かれていないことを確認
    await page.waitForTimeout(1000)
    expect(context.pages().length).toBe(initialPages)
    
    // ニコニコ動画のページに遷移したことを確認
    await expect(page).toHaveURL(/nicovideo\.jp/)
  })

  test('should handle genre and tag changes with scroll reset', async ({ page }) => {
    // 100件まで読み込んでスクロール
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('[data-testid="ranking-item"]')
      return items.length >= 100
    })
    
    await page.evaluate(() => window.scrollTo(0, 2000))
    
    // ジャンルを変更
    await page.click('button:has-text("ゲーム")')
    
    // 新しいデータが読み込まれるのを待つ
    await page.waitForTimeout(1000)
    
    // スクロール位置がリセットされることを確認
    const scrollPosition = await page.evaluate(() => window.scrollY)
    expect(scrollPosition).toBeLessThan(100)
    
    // 新しいジャンルの最初の50件が表示されることを確認
    const items = await page.locator('[data-testid="ranking-item"]').count()
    expect(items).toBe(50)
  })
})