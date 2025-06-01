import { test, expect } from '@playwright/test'

test.describe('Pagination', () => {
  test.beforeEach(async ({ page }) => {
    // モックデータを返すようにAPIをインターセプト
    await page.route('**/api/ranking**', async route => {
      const url = new URL(route.request().url())
      const items = Array.from({ length: 300 }, (_, i) => ({
        rank: i + 1,
        id: `sm${1000 + i}`,
        title: `テスト動画 ${i + 1}`,
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345',
        views: 10000 - i * 10,
        comments: 100,
        mylists: 50,
        likes: 30,
      }))
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, popularTags: [] })
      })
    })
  })

  test('should show pagination UI when more than 100 items', async ({ page }) => {
    await page.goto('/')
    
    // ページネーションが表示される
    await expect(page.locator('text=全300件中 1-100位を表示中')).toBeVisible()
    await expect(page.locator('button:has-text("2")')).toBeVisible()
    await expect(page.locator('button:has-text("3")')).toBeVisible()
    
    // 100件表示されている
    const items = await page.locator('li').count()
    expect(items).toBe(100)
  })

  test('should navigate to page 2', async ({ page }) => {
    await page.goto('/')
    
    // 2ページ目へ移動
    await page.locator('button:has-text("2")').click()
    
    // URLが更新される
    await expect(page).toHaveURL('/?page=2')
    
    // 表示範囲が更新される
    await expect(page.locator('text=全300件中 101-200位を表示中')).toBeVisible()
  })

  test('should navigate with next/previous buttons', async ({ page }) => {
    await page.goto('/')
    
    // 次へボタンで2ページ目へ
    await page.locator('button:has-text("次へ >")').first().click()
    await expect(page).toHaveURL('/?page=2')
    
    // 前へボタンで1ページ目へ
    await page.locator('button:has-text("< 前へ")').first().click()
    await expect(page).toHaveURL('/')
  })

  test('should disable buttons appropriately', async ({ page }) => {
    // 1ページ目
    await page.goto('/')
    const prevButton1 = page.locator('button:has-text("< 前へ")').first()
    await expect(prevButton1).toHaveAttribute('disabled', '')
    
    // 3ページ目（最終ページ）
    await page.goto('/?page=3')
    const nextButton3 = page.locator('button:has-text("次へ >")').first()
    await expect(nextButton3).toHaveAttribute('disabled', '')
  })

  test('should handle direct page access', async ({ page }) => {
    // 直接3ページ目にアクセス
    await page.goto('/?page=3')
    
    await expect(page.locator('text=全300件中 201-300位を表示中')).toBeVisible()
    
    // 3ページ目がアクティブ
    const activeButton = page.locator('button', { hasText: '3' }).first()
    await expect(activeButton).toHaveCSS('background-color', 'rgb(102, 126, 234)')
  })

  test('should not show pagination for less than 100 items', async ({ page }) => {
    // 50件のみのレスポンスを返す
    await page.route('**/api/ranking**', async route => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        rank: i + 1,
        id: `sm${1000 + i}`,
        title: `テスト動画 ${i + 1}`,
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345',
        views: 10000 - i * 10,
      }))
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, popularTags: [] })
      })
    })
    
    await page.goto('/')
    
    // ページネーションが表示されない
    await expect(page.locator('button:has-text("2")')).not.toBeVisible()
    await expect(page.locator('text=全50件中')).not.toBeVisible()
  })
})