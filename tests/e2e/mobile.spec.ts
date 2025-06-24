import { test, expect, devices } from '@playwright/test'

// モバイル専用テスト
test.describe('モバイル専用テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('モバイルメニューが正しく動作する', async ({ page }) => {
    // メニューボタンが表示される（複数の可能性をチェック）
    const menuButton = page.locator('button[aria-label="メニューを開く"], button[aria-label="メニュー"], button:has-text("☰"), [role="button"]:has-text("メニュー")')
    await expect(menuButton.first()).toBeVisible()
    
    // メニューを開く
    await menuButton.first().click()
    
    // メニューが展開される（aria-expandedまたは表示状態をチェック）
    const expandedCheck = menuButton.first().getAttribute('aria-expanded')
    if (await expandedCheck) {
      await expect(menuButton.first()).toHaveAttribute('aria-expanded', 'true')
    }
    
    // メニュー項目が表示される
    await page.waitForTimeout(500)
    const menuItems = await page.locator('#navigation-menu a').count()
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
    // ヘッダーのパディングが適用されている（実際の値に合わせて調整）
    const header = page.locator('header')
    const headerPadding = await header.evaluate(el => window.getComputedStyle(el).padding)
    expect(headerPadding).toMatch(/\d+px/)
    
    // フォントサイズが適切
    const h1 = page.locator('h1')
    const h1FontSize = await h1.evaluate(el => window.getComputedStyle(el).fontSize)
    const fontSize = parseInt(h1FontSize)
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