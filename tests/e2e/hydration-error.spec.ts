import { test, expect } from '@playwright/test'

test.describe('Hydration Error Detection', () => {
  test('should not have React hydration errors on initial load', async ({ page }) => {
    const errors: string[] = []
    
    // コンソールエラーを監視
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // React error #418 はハイドレーションエラー
        if (text.includes('418') || text.includes('Hydration')) {
          errors.push(text)
          console.log('Hydration error detected:', text)
          
          // スタックトレースも取得
          msg.args().forEach(async (arg) => {
            try {
              const value = await arg.jsonValue()
              console.log('Error detail:', value)
            } catch (e) {
              // 無視
            }
          })
        }
      }
    })
    
    // ページアクセス前の環境情報を記録
    const userAgent = await page.evaluate(() => navigator.userAgent)
    console.log('Test environment:', {
      userAgent,
      viewport: page.viewportSize()
    })
    
    // ホームページにアクセス
    await page.goto('/', { waitUntil: 'networkidle' })
    
    // ページが完全に読み込まれるまで待機
    await page.waitForTimeout(2000)
    
    // DOM構造を確認
    const rankingItems = await page.locator('[data-testid="ranking-item"]').count()
    console.log(`Found ${rankingItems} ranking items`)
    
    // 初回レンダリング時の状態をキャプチャ
    const initialHTML = await page.content()
    
    // クライアントサイドでの再レンダリングを待つ
    await page.waitForTimeout(1000)
    
    // ハイドレーション後の状態をキャプチャ
    const hydratedHTML = await page.content()
    
    // 動的な要素を確認
    const dynamicElements = await page.evaluate(() => {
      const elements: any[] = []
      
      // 時刻表示要素を探す
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || ''
        if (/\d{1,2}:\d{2}/.test(text) && el.children.length === 0) {
          elements.push({
            text: text.trim(),
            tag: el.tagName,
            class: el.className
          })
        }
      })
      
      return elements
    })
    
    if (dynamicElements.length > 0) {
      console.log('Found dynamic elements:', dynamicElements)
    }
    
    // エラーがないことを確認
    expect(errors).toHaveLength(0)
  })
  
  test('should not have hydration errors when navigating between genres', async ({ page }) => {
    const errors: string[] = []
    
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('418')) {
        errors.push(msg.text())
      }
    })
    
    await page.goto('/', { waitUntil: 'networkidle' })
    
    // ジャンルセレクタで「音楽・サウンド」をクリック
    await page.click('button:has-text("音楽・サウンド")')
    
    await page.waitForTimeout(2000)
    
    expect(errors).toHaveLength(0)
  })
  
  test('should capture detailed error information', async ({ page }) => {
    let hydrationError: any = null
    
    // より詳細なエラー情報を取得
    await page.addInitScript(() => {
      const originalError = console.error
      console.error = function(...args: any[]) {
        const message = args[0]?.toString() || ''
        if (message.includes('418')) {
          // エラー情報を window オブジェクトに保存
          (window as any).__hydrationError = {
            message,
            stack: new Error().stack,
            timestamp: Date.now(),
            location: window.location.href,
            documentReadyState: document.readyState,
            bodyClassName: document.body.className,
            htmlClassName: document.documentElement.className
          }
        }
        originalError.apply(console, args)
      }
    })
    
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    
    // エラー情報を取得
    hydrationError = await page.evaluate(() => (window as any).__hydrationError)
    
    if (hydrationError) {
      console.log('Detailed hydration error:', JSON.stringify(hydrationError, null, 2))
      
      // スクリーンショットを保存
      await page.screenshot({ 
        path: `hydration-error-${Date.now()}.png`,
        fullPage: true 
      })
      
      // HTMLも保存
      const html = await page.content()
      console.log('Page HTML length:', html.length)
    }
    
    expect(hydrationError).toBeNull()
  })
  
  test('should check for Suspense boundary issues', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    
    // Suspense fallbackが表示されていないか確認
    const suspenseFallbacks = await page.evaluate(() => {
      const fallbacks: any[] = []
      
      // 一般的なローディング表示を探す
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || ''
        if (text.includes('Loading...') || text.includes('読み込み中')) {
          fallbacks.push({
            text: text.trim(),
            display: window.getComputedStyle(el).display,
            visibility: window.getComputedStyle(el).visibility
          })
        }
      })
      
      return fallbacks
    })
    
    console.log('Suspense fallbacks found:', suspenseFallbacks)
    
    // 可視状態のfallbackがないことを確認
    const visibleFallbacks = suspenseFallbacks.filter(
      f => f.display !== 'none' && f.visibility !== 'hidden'
    )
    
    expect(visibleFallbacks).toHaveLength(0)
  })
})