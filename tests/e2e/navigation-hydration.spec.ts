import { test, expect } from '@playwright/test'

test.describe('Navigation Hydration Test', () => {
  test('should not have hydration errors with new navigation', async ({ page }) => {
    // エラーを捕捉
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (text.includes('418') || text.includes('Hydration') || text.includes('HTML')) {
          consoleErrors.push(text)
        }
      }
    })
    
    // ページにアクセス
    await page.goto('http://localhost:3000/')
    
    // ナビゲーションが表示されるまで待機
    await page.waitForSelector('button[aria-label="メニュー"]', { timeout: 10000 })
    
    // 少し待機してハイドレーションを完了させる
    await page.waitForTimeout(2000)
    
    // エラーがないことを確認
    expect(consoleErrors).toHaveLength(0)
    
    // ナビゲーションメニューをクリックできることを確認
    await page.click('button[aria-label="メニュー"]')
    
    // メニューが開くことを確認
    await page.waitForSelector('nav[role="navigation"]', { visible: true })
    
    // ビューポートを変更してレスポンシブ動作を確認
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(1000)
    
    // モバイルナビゲーションが表示されることを確認
    await page.waitForSelector('button[aria-label="メニュー"]')
    
    // エラーがないことを再確認
    expect(consoleErrors).toHaveLength(0)
  })
})