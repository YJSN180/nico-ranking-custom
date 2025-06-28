import { test } from '@playwright/test'

test('モバイル版モーダルアニメーション確認', async ({ page }) => {
  // モバイルビューポートに設定
  await page.setViewportSize({ width: 375, height: 667 })
  
  // ページに移動
  await page.goto('http://localhost:3000')
  await page.waitForLoadState('networkidle')
  
  // 設定モーダルのスクリーンショット（開く前）
  await page.screenshot({ 
    path: 'screenshots/mobile-before-settings.png',
    fullPage: false
  })
  
  // 設定ボタンをクリック
  await page.click('button[aria-label="設定"]')
  await page.waitForTimeout(350) // アニメーション完了待ち
  
  // 設定モーダルのスクリーンショット（開いた後）
  await page.screenshot({ 
    path: 'screenshots/mobile-settings-open.png',
    fullPage: false
  })
  
  // モーダルを閉じる
  await page.click('text=閉じる')
  await page.waitForTimeout(350)
  
  // マイリストボタンをクリック（最初の動画）
  const firstVideo = await page.locator('.video-card').first()
  await firstVideo.hover()
  await firstVideo.locator('button[aria-label*="マイリスト"]').click()
  await page.waitForTimeout(350) // アニメーション完了待ち
  
  // マイリストモーダルのスクリーンショット
  await page.screenshot({ 
    path: 'screenshots/mobile-mylist-open.png',
    fullPage: false
  })
})