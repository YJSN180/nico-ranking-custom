import { test, expect } from '@playwright/test'
import { waitForPageReady } from './helpers/test-helpers'

test.describe('マイリストUI スクリーンショット', () => {
  test('マイリスト詳細ページのスクリーンショット', async ({ page }) => {
    // マイリストページへ移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // とりあえずマイリストをクリック
    const defaultMylist = page.locator('h3:has-text("とりあえずマイリスト")').first()
    if (await defaultMylist.isVisible()) {
      await defaultMylist.click()
      await waitForPageReady(page)
      
      // ページが完全に読み込まれるまで待機
      await page.waitForTimeout(1000)
      
      // デスクトップ版のスクリーンショット
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.screenshot({ 
        path: 'test-results/mylist-detail-desktop.png',
        fullPage: true 
      })
      
      // モバイル版のスクリーンショット
      await page.setViewportSize({ width: 375, height: 667 })
      await page.screenshot({ 
        path: 'test-results/mylist-detail-mobile.png',
        fullPage: true 
      })
      
      // 動画アイテムがある場合、最初のアイテムをスクリーンショット
      const videoItems = page.locator('li[data-testid="mylist-video-item"]')
      const count = await videoItems.count()
      
      if (count > 0) {
        const firstItem = videoItems.first()
        await firstItem.screenshot({ 
          path: 'test-results/mylist-video-item.png' 
        })
      }
    }
  })
})