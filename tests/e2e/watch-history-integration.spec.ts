import { test, expect } from '@playwright/test'

test.describe('視聴履歴の統合テスト', () => {
  test.beforeEach(async ({ page }) => {
    // IndexedDBをクリア
    await page.goto('/')
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const deleteReq = indexedDB.deleteDatabase('nicoran-db')
        deleteReq.onsuccess = () => resolve(undefined)
        deleteReq.onerror = () => resolve(undefined)
        deleteReq.onblocked = () => resolve(undefined)
      })
    })
  })

  test('動画をクリックすると視聴履歴に追加され、視聴履歴ページに表示される', async ({ page }) => {
    // 1. トップページにアクセス
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 2. 最初の動画のタイトルを記録
    const firstVideoTitle = await page.locator('[data-testid="video-title"]').first().textContent()
    expect(firstVideoTitle).toBeTruthy()

    // 3. 最初の動画をクリック（新しいタブで開くのを防ぐ）
    await page.evaluate(() => {
      // window.openをモック
      window.open = () => null
    })
    
    await page.locator('[data-testid="video-title"]').first().click()
    await page.waitForTimeout(500) // IndexedDBへの書き込みを待つ

    // 4. 視聴履歴ページに移動
    await page.goto('/watch-history')
    await page.waitForLoadState('networkidle')

    // 5. 視聴履歴に動画が表示されることを確認
    await expect(page.locator('text=' + firstVideoTitle)).toBeVisible()
    await expect(page.locator('text=視聴回数: 1回')).toBeVisible()

    // 6. 統計情報が正しく表示されることを確認
    await expect(page.locator('text=全1件の視聴履歴')).toBeVisible()
  })

  test('同じ動画を複数回クリックするとwatchCountが増加する', async ({ page }) => {
    // 1. トップページにアクセス
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 2. window.openをモック
    await page.evaluate(() => {
      window.open = () => null
    })

    // 3. 最初の動画を3回クリック
    const firstVideo = page.locator('[data-testid="video-title"]').first()
    const videoTitle = await firstVideo.textContent()
    
    await firstVideo.click()
    await page.waitForTimeout(300)
    
    await firstVideo.click()
    await page.waitForTimeout(300)
    
    await firstVideo.click()
    await page.waitForTimeout(300)

    // 4. 視聴履歴ページに移動
    await page.goto('/watch-history')
    await page.waitForLoadState('networkidle')

    // 5. 視聴回数が3回になっていることを確認
    await expect(page.locator('text=視聴回数: 3回')).toBeVisible()
    await expect(page.locator('text=' + videoTitle)).toBeVisible()
  })

  test('視聴履歴ページから動画をクリックしても正しく記録される', async ({ page }) => {
    // 1. まず動画を視聴履歴に追加
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await page.evaluate(() => {
      window.open = () => null
    })
    
    await page.locator('[data-testid="video-title"]').first().click()
    await page.waitForTimeout(500)

    // 2. 視聴履歴ページに移動
    await page.goto('/watch-history')
    await page.waitForLoadState('networkidle')

    // 3. 視聴履歴から動画をクリック
    await page.locator('[data-testid="video-title"]').first().click()
    await page.waitForTimeout(500)

    // 4. ページをリロード
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 5. 視聴回数が2回になっていることを確認
    await expect(page.locator('text=視聴回数: 2回')).toBeVisible()
  })
})