import { test, expect } from '@playwright/test'

test.describe('視聴履歴ページデバッグ', () => {
  test('メニューから視聴履歴リンクが正しく動作するか確認', async ({ page }) => {
    // ホームページにアクセス
    await page.goto('/')
    
    // メニューボタンをクリック
    await page.click('button[aria-label="メニュー"]')
    
    // メニューが開いたことを確認
    await page.waitForSelector('nav[id="navigation-menu"], nav[id="navigation-dropdown"]', { 
      state: 'visible',
      timeout: 5000 
    })
    
    // 視聴履歴リンクを探す（複数のセレクタを試す）
    const selectors = [
      'a[href="/watch-history"]',
      'text=視聴履歴',
      'a:has-text("視聴履歴")',
      'nav a[href="/watch-history"]'
    ]
    
    let watchHistoryLink = null
    for (const selector of selectors) {
      try {
        watchHistoryLink = await page.locator(selector).first()
        if (await watchHistoryLink.isVisible()) {
          console.log(`Found link with selector: ${selector}`)
          break
        }
      } catch (e) {
        console.log(`Selector ${selector} not found`)
      }
    }
    
    if (!watchHistoryLink) {
      throw new Error('視聴履歴リンクが見つかりませんでした')
    }
    
    // リンクの属性を確認
    const href = await watchHistoryLink.getAttribute('href')
    console.log(`Link href: ${href}`)
    
    // リンクが表示されていることを確認
    await expect(watchHistoryLink).toBeVisible()
    
    // リンクをクリック
    await watchHistoryLink.click()
    
    // ページ遷移を待つ
    await page.waitForURL('**/watch-history', { timeout: 10000 })
    
    // 視聴履歴ページが表示されることを確認
    await expect(page).toHaveURL('/watch-history')
    await expect(page.locator('h1')).toHaveText('視聴履歴')
  })

  test('視聴履歴ページの直接アクセスと基本要素', async ({ page }) => {
    // 直接視聴履歴ページにアクセス
    const response = await page.goto('/watch-history')
    
    // レスポンスステータスを確認
    expect(response?.status()).toBe(200)
    
    // ページタイトルを確認
    await expect(page).toHaveTitle(/視聴履歴/)
    
    // h1要素が表示されることを確認
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
    await expect(h1).toHaveText('視聴履歴')
    
    // 検索バーが表示されることを確認
    const searchBar = page.locator('input[placeholder="視聴履歴を検索..."]')
    await expect(searchBar).toBeVisible()
    
    // ソート選択が表示されることを確認
    const sortSelect = page.locator('select')
    await expect(sortSelect).toBeVisible()
    
    // ボタンが表示されることを確認
    await expect(page.locator('button:has-text("選択")')).toBeVisible()
    await expect(page.locator('button:has-text("すべて削除")')).toBeVisible()
  })

  test('モバイルビューでの視聴履歴リンク', async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto('/')
    
    // メニューボタンをクリック
    await page.click('button[aria-label="メニュー"], button[aria-label="メニューを開く"]')
    
    // サイドドロワーが開くのを待つ
    await page.waitForSelector('nav#navigation-menu', { state: 'visible' })
    
    // 視聴履歴リンクを探す
    const watchHistoryLink = page.locator('nav#navigation-menu a[href="/watch-history"]')
    await expect(watchHistoryLink).toBeVisible()
    
    // リンクをクリック
    await watchHistoryLink.click()
    
    // ページ遷移を確認
    await expect(page).toHaveURL('/watch-history')
  })
})