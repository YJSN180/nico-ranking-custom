import { test, expect } from '@playwright/test'

test.describe('Hydrationデバッグ', () => {
  test('設定ボタンがクリック可能か確認', async ({ page }) => {
    // ページに移動
    await page.goto('/')
    
    // ページの読み込み完了を待つ
    await page.waitForLoadState('networkidle')
    
    // コンソールログを監視
    page.on('console', msg => {
      console.log(`Browser console [${msg.type()}]:`, msg.text())
    })
    
    // エラーを監視
    page.on('pageerror', error => {
      console.error('Page error:', error.message)
    })
    
    // 設定ボタンを探す
    const settingsButton = page.locator('button[aria-label="設定"]')
    await expect(settingsButton).toBeVisible({ timeout: 10000 })
    
    // ボタンの状態を確認
    const isEnabled = await settingsButton.isEnabled()
    console.log('設定ボタンは有効か:', isEnabled)
    
    // JavaScriptが有効か確認
    const jsEnabled = await page.evaluate(() => {
      return typeof window !== 'undefined' && typeof document !== 'undefined'
    })
    console.log('JavaScriptは有効か:', jsEnabled)
    
    // Reactが正しくロードされているか確認
    const reactLoaded = await page.evaluate(() => {
      return typeof (window as any).React !== 'undefined' || 
             !!(window as any).__NEXT_DATA__
    })
    console.log('Next.js/Reactはロードされているか:', reactLoaded)
    
    // CSP違反があるか確認
    const cspViolations = await page.evaluate(() => {
      return new Promise(resolve => {
        const violations: string[] = []
        document.addEventListener('securitypolicyviolation', (e) => {
          violations.push(`${e.violatedDirective}: ${e.blockedURI}`)
        })
        setTimeout(() => resolve(violations), 1000)
      })
    })
    console.log('CSP違反:', cspViolations)
    
    // ボタンをクリック
    await settingsButton.click()
    
    // モーダルが表示されるか確認
    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first()
    
    try {
      await expect(modal).toBeVisible({ timeout: 5000 })
      console.log('✅ モーダルが正常に表示されました')
    } catch (error) {
      console.log('❌ モーダルが表示されませんでした')
      
      // ページの現在の状態を確認
      const pageTitle = await page.title()
      console.log('ページタイトル:', pageTitle)
      
      // 設定ボタンのクラス名を確認
      const buttonClasses = await settingsButton.getAttribute('class')
      console.log('設定ボタンのクラス:', buttonClasses)
      
      throw error
    }
  })
  
  test('CSPヘッダーの確認', async ({ page }) => {
    const response = await page.goto('/')
    const cspHeader = response?.headers()['content-security-policy']
    
    console.log('CSPヘッダー:', cspHeader)
    
    // CSPにunsafe-evalが含まれているか、またはbypassCSPが効いているか確認
    const hasUnsafeEval = cspHeader?.includes('unsafe-eval') || false
    const bypassWorking = await page.evaluate(() => {
      try {
        // eval()が実行できるか試す
        eval('1 + 1')
        return true
      } catch {
        return false
      }
    })
    
    console.log('unsafe-evalが許可されているか:', hasUnsafeEval)
    console.log('evalが実行可能か:', bypassWorking)
    
    expect(bypassWorking).toBe(true)
  })
})