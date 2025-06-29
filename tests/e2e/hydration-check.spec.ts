import { test, expect } from '@playwright/test'

test.describe('Hydration Error Check', () => {
  test('should not have React error #418', async ({ page }) => {
    // エラーを捕捉
    const hydrationErrors: string[] = []
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (text.includes('418') || text.includes('Hydration') || text.includes('Minified React error')) {
          hydrationErrors.push(text)
          console.log('Captured error:', text)
        }
      }
    })
    
    // ページエラーも捕捉
    page.on('pageerror', error => {
      const message = error.message
      if (message.includes('418') || message.includes('Hydration')) {
        hydrationErrors.push(message)
        console.log('Page error:', message)
      }
    })
    
    // ページにアクセス
    await page.goto('http://localhost:3000/')
    
    // コンテンツが読み込まれるまで待機
    await page.waitForSelector('[data-testid="ranking-item"]')
    
    // ハイドレーションが完了するまで待機
    await page.waitForTimeout(3000)
    
    // エラーがないことを確認
    if (hydrationErrors.length > 0) {
      console.log('Hydration errors detected:')
      hydrationErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`)
      })
    }
    
    expect(hydrationErrors).toHaveLength(0)
  })
  
  test('should check console for any React errors', async ({ page }) => {
    const allErrors: string[] = []
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        allErrors.push(msg.text())
      }
    })
    
    await page.goto('http://localhost:3000/')
    await page.waitForSelector('[data-testid="ranking-item"]')
    await page.waitForTimeout(2000)
    
    // React関連のエラーのみをフィルタ
    const reactErrors = allErrors.filter(error => 
      error.includes('React') || 
      error.includes('react') || 
      error.includes('418') ||
      error.includes('Hydration')
    )
    
    if (reactErrors.length > 0) {
      console.log('React errors found:')
      reactErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`)
      })
    }
    
    expect(reactErrors).toHaveLength(0)
  })
})