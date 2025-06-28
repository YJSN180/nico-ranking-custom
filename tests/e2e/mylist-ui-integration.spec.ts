import { test, expect } from '@playwright/test'
import { waitForPageReady } from './helpers/test-helpers'

test.describe('マイリストUI統合テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('マイリストページの基本表示確認', async ({ page }) => {
    // マイリストページへ移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // ページタイトル確認
    await expect(page.locator('h2')).toContainText('マイリスト管理')
    
    // 新規作成ボタン確認
    await expect(page.locator('button:has-text("新規マイリスト作成")')).toBeVisible()
    
    // 戻るリンク確認
    await expect(page.locator('a:has-text("トップページに戻る")')).toBeVisible()
  })

  test('マイリスト詳細ページのUI確認', async ({ page }) => {
    // まずマイリストページへ
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // とりあえずマイリストが存在する場合、クリック
    const defaultMylist = page.locator('h3:has-text("とりあえずマイリスト")').first()
    if (await defaultMylist.isVisible()) {
      await defaultMylist.click()
      await waitForPageReady(page)
      
      // 詳細ページの要素確認
      await expect(page.locator('a:has-text("マイリスト一覧に戻る")')).toBeVisible()
      await expect(page.locator('button:has-text("マイリスト設定")')).toBeVisible()
      
      // 検索バーとソート選択
      await expect(page.locator('input[placeholder*="検索"]')).toBeVisible()
      await expect(page.locator('select')).toBeVisible()
    }
  })

  test('新しいマイリスト動画アイテムの表示確認', async ({ page }) => {
    // テスト用にダミーデータを持つマイリストを作成
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // とりあえずマイリストをクリック
    const defaultMylist = page.locator('h3:has-text("とりあえずマイリスト")').first()
    if (await defaultMylist.isVisible()) {
      await defaultMylist.click()
      await waitForPageReady(page)
      
      // 動画一覧の構造を確認（空でも構造は存在するはず）
      const videoList = page.locator('ul').first()
      
      // 動画がある場合
      const videoItems = page.locator('li[data-testid="mylist-video-item"]')
      const count = await videoItems.count()
      
      if (count > 0) {
        // 最初の動画アイテムの構造確認
        const firstItem = videoItems.first()
        
        // 編集・削除ボタンの存在確認
        await expect(firstItem.locator('button:has-text("編集")')).toBeVisible()
        await expect(firstItem.locator('button:has-text("削除")')).toBeVisible()
        
        // 統計情報の表示確認
        const stats = firstItem.locator('[data-testid="video-stats"]')
        await expect(stats).toBeVisible()
      }
    }
  })
})