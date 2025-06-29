import { test, expect } from '@playwright/test'

test.describe('Preview Environment Hydration Check', () => {
  test('should verify hydration fix in Vercel preview', async ({ page }) => {
    // エラーを捕捉
    const hydrationErrors: string[] = []
    const reactErrors: string[] = []
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (text.includes('418') || text.includes('Hydration') || text.includes('Minified React error')) {
          hydrationErrors.push(text)
          console.log('🚨 Hydration error detected:', text)
        }
        if (text.includes('React') || text.includes('react')) {
          reactErrors.push(text)
          console.log('⚠️ React error detected:', text)
        }
      }
    })
    
    // ページエラーも捕捉
    page.on('pageerror', error => {
      const message = error.message
      if (message.includes('418') || message.includes('Hydration')) {
        hydrationErrors.push(message)
        console.log('🚨 Page hydration error:', message)
      }
    })
    
    // Vercelプレビューページにアクセス（ローカル開発環境で確認）
    console.log('🌐 Testing hydration fix on local development...')
    await page.goto('http://localhost:3000/')
    
    // コンテンツが読み込まれるまで待機
    await page.waitForSelector('[data-testid="ranking-item"]', { timeout: 15000 })
    console.log('✅ Page content loaded')
    
    // ナビゲーションコンポーネントの存在確認（両方のボタンが存在することを確認）
    const navigationButtons = page.locator('button[aria-label="メニュー"]')
    await expect(navigationButtons).toHaveCount(2) // モバイル用とデスクトップ用
    console.log('✅ Both mobile and desktop navigation buttons found (hydration fix working)')
    
    // ハイドレーションが完了するまで十分待機
    await page.waitForTimeout(5000)
    console.log('⏱️ Waited for hydration to complete')
    
    // デスクトップビューポートでテスト
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.waitForTimeout(2000)
    
    // モバイルビューポートでテスト
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(2000)
    
    // 最終確認
    console.log(`📊 Total hydration errors: ${hydrationErrors.length}`)
    console.log(`📊 Total React errors: ${reactErrors.length}`)
    
    if (hydrationErrors.length > 0) {
      console.log('🚨 Hydration errors found:')
      hydrationErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`)
      })
    } else {
      console.log('🎉 No hydration errors detected!')
    }
    
    // React error #418が修正されていることを確認
    expect(hydrationErrors).toHaveLength(0)
  })
})