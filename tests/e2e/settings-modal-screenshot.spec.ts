import { test } from '@playwright/test'

test('設定モーダルのタブ切り替え時のサイズ確認', async ({ page }) => {
  // ページに移動
  await page.goto('http://localhost:3000')
  await page.waitForLoadState('networkidle')
  
  // 設定ボタンをクリック
  await page.click('button[aria-label="設定"]')
  await page.waitForTimeout(500)
  
  // 表示設定タブのスクリーンショット
  await page.screenshot({ 
    path: 'screenshots/settings-display-tab.png',
    fullPage: false
  })
  
  // NGリスト管理タブに切り替え
  await page.click('text=NGリスト管理')
  await page.waitForTimeout(500)
  
  // NGリスト管理タブのスクリーンショット
  await page.screenshot({ 
    path: 'screenshots/settings-nglist-tab.png',
    fullPage: false
  })
})