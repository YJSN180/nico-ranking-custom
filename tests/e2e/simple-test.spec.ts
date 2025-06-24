import { test, expect } from '@playwright/test'

test.describe('基本機能の確認', () => {
  test('設定ボタンがクリックできる', async ({ page }) => {
    // ページに移動
    await page.goto('/')
    
    // ページが完全に読み込まれるまで待つ
    await page.waitForLoadState('domcontentloaded')
    
    // 設定ボタンを探す
    const settingsButton = page.locator('button[aria-label="設定"]')
    
    // ボタンが存在することを確認
    await expect(settingsButton).toBeVisible({ timeout: 10000 })
    
    // ボタンをクリック
    await settingsButton.click()
    
    // モーダル要素を探す（CSSモジュールのため部分一致）
    const modalOverlay = page.locator('[class*="overlay"]').first()
    const modalContent = page.locator('[class*="modal"]').first()
    
    // モーダルが表示されることを確認
    await expect(modalOverlay).toBeVisible({ timeout: 5000 })
    await expect(modalContent).toBeVisible({ timeout: 5000 })
    
    // モーダル内のタイトルを確認
    await expect(page.locator('h2:has-text("設定")')).toBeVisible()
  })
  
  test('設定モーダルのタブが切り替わる', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    
    // 設定を開く
    await page.click('button[aria-label="設定"]')
    
    // NGリスト管理タブがデフォルトで選択されていることを確認
    const ngListTab = page.locator('button:has-text("NGリスト管理")')
    await expect(ngListTab).toHaveClass(/active/)
    
    // 表示設定タブをクリック
    const displayTab = page.locator('button:has-text("表示設定")')
    await displayTab.click()
    
    // タブが切り替わったことを確認
    await expect(displayTab).toHaveClass(/active/)
    await expect(ngListTab).not.toHaveClass(/active/)
  })
})