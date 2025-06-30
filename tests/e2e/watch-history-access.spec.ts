import { test, expect } from '@playwright/test'

test.describe('視聴履歴ページへのアクセス（修正後）', () => {
  test('視聴履歴ページに正常にアクセスできる', async ({ page }) => {
    // ホームページにアクセス
    await page.goto('/')
    
    // メニューボタンをクリック
    await page.click('button[aria-label="メニュー"]')
    
    // 視聴履歴リンクが表示されることを確認
    const watchHistoryLink = page.locator('a[href="/watch-history"]')
    await expect(watchHistoryLink).toBeVisible()
    await expect(watchHistoryLink).toHaveText('視聴履歴')
    
    // 視聴履歴リンクをクリックしてページ遷移を待機
    await Promise.all([
      page.waitForURL('/watch-history'),
      watchHistoryLink.click()
    ])
    
    // ページタイトルが表示されることを確認（main内のh1を特定）
    await expect(page.locator('main h1')).toHaveText('視聴履歴')
    
    // エラーが表示されていないことを確認
    const errorMessage = page.locator('text=エラー')
    await expect(errorMessage).not.toBeVisible()
  })

  test('直接URLアクセスで視聴履歴ページが表示される', async ({ page }) => {
    // 直接視聴履歴ページにアクセス
    await page.goto('/watch-history')
    
    // ページが正常に表示されることを確認（main内のh1を特定）
    await expect(page.locator('main h1')).toHaveText('視聴履歴')
    
    // 基本的なUI要素が表示されることを確認
    await expect(page.locator('input[placeholder="視聴履歴を検索..."]')).toBeVisible()
    await expect(page.locator('select')).toBeVisible() // ソート選択
    await expect(page.locator('button:has-text("選択")')).toBeVisible()
    await expect(page.locator('button:has-text("すべて削除")')).toBeVisible()
  })

  test('視聴履歴がない場合の表示', async ({ page }) => {
    // IndexedDBをクリア
    await page.goto('/watch-history')
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('NicoRankingDB')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      })
    })
    
    // ページをリロード
    await page.reload()
    
    // 空の状態メッセージが表示されることを確認
    await expect(page.locator('text=まだ視聴履歴がありません')).toBeVisible()
    await expect(page.locator('text=動画を視聴すると、ここに履歴が表示されます')).toBeVisible()
    await expect(page.locator('a:has-text("ランキングを見る")')).toBeVisible()
  })

  test('視聴履歴ページの構造が正しい（修正後）', async ({ page }) => {
    await page.goto('/watch-history')
    
    // HeaderWithSettingsが正しく表示される
    const header = page.locator('header')
    await expect(header).toBeVisible()
    await expect(header.locator('[aria-label="メニュー"]')).toBeVisible()
    await expect(header.locator('[aria-label="設定"]')).toBeVisible()
    
    // main要素が存在し、適切なクラスが設定されている
    const main = page.locator('main')
    await expect(main).toBeVisible()
    await expect(main).toHaveClass(/main/)
    
    // フッターが表示される
    const footer = page.locator('footer')
    await expect(footer).toBeVisible()
    
    // メインコンテンツがmain要素内に含まれている
    await expect(main.locator('h1:has-text("視聴履歴")')).toBeVisible()
    await expect(main.locator('input[placeholder="視聴履歴を検索..."]')).toBeVisible()
  })

  test('修正後の視聴履歴ページ構造が正しい', async ({ page }) => {
    await page.goto('/watch-history')
    
    // 修正後：HeaderWithSettings + main + Footer構造
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
    
    // メインコンテンツが正しく表示される
    await expect(page.locator('main h1')).toHaveText('視聴履歴')
    await expect(page.locator('main input[placeholder="視聴履歴を検索..."]')).toBeVisible()
  })
})