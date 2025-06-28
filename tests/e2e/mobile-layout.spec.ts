import { test, expect } from '@playwright/test'

test.describe('Mobile Layout - Mylist Button Position', () => {
  test.beforeEach(async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 })
    // ランキングページに移動
    await page.goto('/ranking/all?term=24h')
    await page.waitForSelector('[data-testid="ranking-item"]')
  })

  test('マイリストボタンがタイトル行の右端に配置される', async ({ page }) => {
    // 最初のランキングアイテムを取得
    const firstItem = page.locator('[data-testid="ranking-item"]').first()
    
    // タイトル行の存在確認
    const titleRow = firstItem.locator('.ranking-item-responsive__title-row')
    await expect(titleRow).toBeVisible()
    
    // タイトルとマイリストボタンが同じ行にあることを確認
    const title = titleRow.locator('[data-testid="video-title"]')
    const mylistButton = titleRow.locator('.ranking-item-responsive__mylist-button')
    
    await expect(title).toBeVisible()
    await expect(mylistButton).toBeVisible()
    
    // レイアウトが正しいことを視覚的に確認
    const titleBox = await title.boundingBox()
    const buttonBox = await mylistButton.boundingBox()
    
    if (titleBox && buttonBox) {
      // ボタンがタイトルの右側にあることを確認
      expect(buttonBox.x).toBeGreaterThan(titleBox.x + titleBox.width)
      // ボタンとタイトルが同じ高さ（Y座標）にあることを確認（許容誤差5px）
      expect(Math.abs(buttonBox.y - titleBox.y)).toBeLessThan(5)
    }
  })

  test('統計情報が横スクロールなしで表示される', async ({ page }) => {
    // 最初のランキングアイテムを取得
    const firstItem = page.locator('[data-testid="ranking-item"]').first()
    
    // 統計情報コンテナを取得
    const stats = firstItem.locator('[data-testid="video-stats"]')
    await expect(stats).toBeVisible()
    
    // 統計情報の各要素が表示されていることを確認
    await expect(stats.locator('text=/▶️/')).toBeVisible()
    await expect(stats.locator('text=/💬/')).toBeVisible()
    await expect(stats.locator('text=/❤️/')).toBeVisible()
    await expect(stats.locator('text=/📁/')).toBeVisible()
    
    // 横スクロールがないことを確認
    const statsElement = await stats.elementHandle()
    if (statsElement) {
      const scrollWidth = await statsElement.evaluate(el => el.scrollWidth)
      const clientWidth = await statsElement.evaluate(el => el.clientWidth)
      // scrollWidthとclientWidthがほぼ同じなら横スクロールなし
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1) // 1pxの誤差を許容
    }
  })

  test('デスクトップ版マイリストエリアが非表示になっている', async ({ page }) => {
    // 最初のランキングアイテムを取得
    const firstItem = page.locator('[data-testid="ranking-item"]').first()
    
    // デスクトップ版マイリストエリアが非表示であることを確認
    const desktopMylistArea = firstItem.locator('.ranking-item-responsive__mylist-area')
    await expect(desktopMylistArea).toBeHidden()
  })

  test('モバイルレイアウトのスクリーンショット', async ({ page }) => {
    // ページが完全に読み込まれるまで待機
    await page.waitForTimeout(1000)
    
    // 最初の3つのランキングアイテムのスクリーンショットを撮影
    const container = page.locator('.ranking-list').first()
    await container.screenshot({ 
      path: '__tests__/e2e/screenshots/mobile-layout-mylist-button.png',
      fullPage: false
    })
  })
})