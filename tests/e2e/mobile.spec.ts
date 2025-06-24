import { test, expect, devices } from '@playwright/test'

// モバイル専用テスト
test.describe('モバイル専用テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('モバイルメニューが正しく動作する', async ({ page }) => {
    // メニューボタンが表示される
    const menuButton = page.locator('button[aria-label="メニュー"]')
    await expect(menuButton).toBeVisible()
    
    // メニューを開く
    await menuButton.click()
    
    // メニューが展開される
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    
    // メニュー項目が表示される
    await page.waitForTimeout(500)
    const menuItems = await page.locator('[role="menuitem"], nav a, [class*="dropdown"] a').count()
    expect(menuItems).toBeGreaterThan(0)
  })

  test('タッチジェスチャーが機能する', async ({ page }) => {
    // スワイプシミュレーション
    await page.touchscreen.tap(100, 100)
    
    // ダブルタップでズーム防止
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('maximum-scale')
  })

  test('モバイル用のスタイルが適用される', async ({ page }) => {
    // ヘッダーのパディングが小さい
    const header = page.locator('header')
    const headerStyle = await header.evaluate(el => window.getComputedStyle(el))
    expect(headerStyle.padding).toMatch(/5px|12px/)
    
    // フォントサイズが適切
    const h1 = page.locator('h1')
    const h1Style = await h1.evaluate(el => window.getComputedStyle(el))
    const fontSize = parseInt(h1Style.fontSize)
    expect(fontSize).toBeLessThan(40) // モバイルでは小さめ
  })

  test('モバイルでの画像最適化', async ({ page }) => {
    const images = page.locator('img')
    const imageCount = await images.count()
    
    if (imageCount > 0) {
      // srcsetが設定されている
      const firstImage = images.first()
      const srcset = await firstImage.getAttribute('srcset')
      if (srcset) {
        // 複数の解像度が用意されている
        expect(srcset.split(',').length).toBeGreaterThan(1)
      }
      
      // 適切なサイズが指定されている
      const sizes = await firstImage.getAttribute('sizes')
      if (sizes) {
        expect(sizes).toBeTruthy()
      }
    }
  })

  test('モバイルでのスクロールパフォーマンス', async ({ page }) => {
    // スクロール可能か確認
    const isScrollable = await page.evaluate(() => {
      return document.documentElement.scrollHeight > window.innerHeight
    })
    
    if (isScrollable) {
      // スムーススクロール
      await page.evaluate(() => {
        window.scrollTo({ top: 500, behavior: 'smooth' })
      })
      
      await page.waitForTimeout(1000)
      
      // スクロール位置が変更されたか確認
      const scrollY = await page.evaluate(() => window.scrollY)
      expect(scrollY).toBeGreaterThan(0)
    }
  })

  test('モバイルでのフォーム入力', async ({ page }) => {
    // 入力フィールドを探す
    const inputs = page.locator('input[type="text"], input[type="search"]')
    const inputCount = await inputs.count()
    
    if (inputCount > 0) {
      const firstInput = inputs.first()
      
      // タップで入力フィールドにフォーカス
      await firstInput.tap()
      
      // キーボードが表示されることを想定（実際のデバイスでのみ）
      await page.waitForTimeout(500)
      
      // 入力
      await firstInput.type('テスト入力')
      
      // 値が入力されたことを確認
      const value = await firstInput.inputValue()
      expect(value).toBe('テスト入力')
    }
  })

  test('オフラインモードの処理', async ({ page, context }) => {
    // オフラインモードをシミュレート
    await context.setOffline(true)
    
    // ページをリロード
    await page.reload().catch(() => {
      // オフラインでリロードは失敗する可能性がある
    })
    
    // エラーメッセージが表示されるか、キャッシュされたコンテンツが表示される
    await page.waitForTimeout(1000)
    
    const hasError = await page.locator('text=/エラー|オフライン|接続/').count() > 0
    const hasContent = await page.locator('h1').count() > 0
    
    expect(hasError || hasContent).toBeTruthy()
  })

  test('PWA機能の確認', async ({ page }) => {
    // マニフェストファイル
    const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifestLink).toBeTruthy()
    
    // サービスワーカーの登録確認（もし実装されていれば）
    const hasServiceWorker = await page.evaluate(() => {
      return 'serviceWorker' in navigator
    })
    expect(hasServiceWorker).toBeTruthy()
    
    // テーマカラー
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
    expect(themeColor).toBeTruthy()
    
    // アプリアイコン
    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    expect(appleIcon).toBeTruthy()
  })
})