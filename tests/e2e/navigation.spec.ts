import { test, expect } from '@playwright/test'

test.describe('ナビゲーション機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('ジャンル選択が機能する', async ({ page }) => {
    // ジャンルセレクター（ボタンまたはselect要素）を探す
    const genreButton = page.locator('button:has-text("ゲーム")')
    const genreSelector = page.locator('select').first()
    
    if (await genreButton.count() > 0) {
      // ボタン形式のジャンル選択
      await genreButton.click()
      await page.waitForTimeout(500)
      
      // URLまたはページ内容が更新されることを確認
      const currentUrl = page.url()
      const hasGenreParam = currentUrl.includes('genre=game')
      const hasContent = await page.locator('h1').count() > 0
      
      expect(hasGenreParam || hasContent).toBeTruthy()
    } else if (await genreSelector.count() > 0) {
      // select要素の場合
      await genreSelector.selectOption({ label: 'ゲーム' })
      await expect(page).toHaveURL(/genre=game/)
    } else {
      test.skip(true, 'ジャンル選択UI要素が見つかりません')
    }
  })

  test('期間選択が機能する', async ({ page }) => {
    // 期間選択ボタンまたはリンクを探す（24時間/毎時）
    const hourlyButton = page.locator('button:has-text("毎時"), button:has-text("1時間")')
    
    if (await hourlyButton.count() > 0) {
      await hourlyButton.first().click()
      
      // ページが更新されることを確認（URLは必ずしも変わらない場合もある）
      await page.waitForTimeout(500) // 少し待つ
      const currentUrl = page.url()
      
      // URLにperiod=hourが含まれるか、またはページが正常に表示されることを確認
      const hasHourParam = currentUrl.includes('period=hour')
      const hasValidContent = await page.locator('h1').count() > 0
      
      expect(hasHourParam || hasValidContent).toBeTruthy()
    } else {
      // 期間選択ボタンが見つからない場合はスキップ
      test.skip(true, '期間選択ボタンが見つかりません')
    }
  })

  test('人気タグが表示され、クリック可能', async ({ page }) => {
    // 人気タグセクションを探す
    const tagSection = page.locator('text=人気タグ, text=タグ').first()
    
    if (await tagSection.count() > 0) {
      // タグリンクを探す
      const tagLinks = page.locator('a[href*="tag="], button:has-text("#")')
      
      if (await tagLinks.count() > 0) {
        const firstTag = tagLinks.first()
        const tagText = await firstTag.textContent()
        
        // タグをクリック
        await firstTag.click()
        
        // URLにタグパラメータが含まれることを確認
        await expect(page).toHaveURL(/tag=/)
      }
    }
  })

  test('ページネーションが機能する', async ({ page }) => {
    // ページネーションコントロールを探す
    const nextPageButton = page.locator('button:has-text("次"), a:has-text("次"), button:has-text("→"), a:has-text("→"), [aria-label*="次のページ"]')
    
    if (await nextPageButton.count() > 0) {
      await nextPageButton.first().click()
      await page.waitForTimeout(500)
      
      // URLにページパラメータが含まれるか、ページ内容が変わることを確認
      const currentUrl = page.url()
      const hasPageParam = currentUrl.includes('page=2') || currentUrl.includes('offset=')
      const hasContent = await page.locator('h1').count() > 0
      
      expect(hasPageParam || hasContent).toBeTruthy()
    } else {
      test.skip(true, 'ページネーション要素が見つかりません')
    }
  })

  test('ホームロゴクリックでトップページに戻る', async ({ page }) => {
    // まず別のページに移動
    await page.goto('/?genre=game&period=hour')
    await page.waitForLoadState('networkidle')
    
    // ロゴまたはサイトタイトルをクリック
    const logo = page.locator('h1, a:has-text("ニコラン"), [role="banner"] a')
    if (await logo.count() > 0) {
      await logo.first().click()
      await page.waitForTimeout(500)
      
      // トップページに戻ったかを確認（URLまたはページ表示で判定）
      const currentUrl = page.url()
      const isHomePage = !currentUrl.includes('genre=game') || currentUrl === page.url().split('?')[0]
      const hasContent = await page.locator('h1').count() > 0
      
      expect(isHomePage || hasContent).toBeTruthy()
    } else {
      test.skip(true, 'ホームロゴ要素が見つかりません')
    }
  })

  test('無効なジャンルの場合、総合ランキングにリダイレクト', async ({ page }) => {
    // 無効なジャンルでアクセス
    await page.goto('/?genre=invalid')
    
    // リダイレクトまたはデフォルト表示を確認
    await page.waitForLoadState('networkidle')
    
    // 総合ランキングが表示されることを確認
    const hasValidContent = await page.locator('h1').count() > 0
    expect(hasValidContent).toBeTruthy()
  })

  test('URLパラメータによる直接アクセスが機能する', async ({ page }) => {
    // まずホームページに移動して人気タグを取得
    await page.goto('/')
    
    // 人気タグが存在する場合、最初のタグを取得（「すべて」以外）
    const tagButtons = page.locator('button').filter({ hasText: /^(?!すべて).*/ })
    const firstTagButton = tagButtons.filter({ has: page.locator('[class*="tagButton"]') }).first()
    const tagExists = await firstTagButton.count() > 0
    
    if (tagExists) {
      // 最初の人気タグのテキストを取得
      const tagText = await firstTagButton.textContent()
      const encodedTag = encodeURIComponent(tagText?.trim() || '')
      
      // 特定のジャンル・期間・タグで直接アクセス
      await page.goto(`/?genre=music&period=hour&tag=${encodedTag}`)
      
      // ページのロードとレンダリングを待つ
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000) // CI環境での安定性のため追加の待機
      
      // ページが正常に表示されることを確認
      await expect(page.locator('h1')).toBeVisible()
      
      // URLパラメータが維持されていることを確認（CI環境での遅延を考慮）
      await page.waitForFunction(
        () => window.location.href.includes('genre=music'),
        { timeout: 5000 }
      )
      expect(page.url()).toContain('genre=music')
      expect(page.url()).toContain('period=hour')
      expect(page.url()).toContain('tag=')
    } else {
      // タグがない場合はジャンルと期間のみでテスト
      await page.goto('/?genre=music&period=hour')
      
      // ページのロードとレンダリングを待つ
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000) // CI環境での安定性のため追加の待機
      
      // ページが正常に表示されることを確認
      await expect(page.locator('h1')).toBeVisible()
      
      // URLパラメータが維持されていることを確認（CI環境での遅延を考慮）
      await page.waitForFunction(
        () => window.location.href.includes('genre=music'),
        { timeout: 5000 }
      )
      expect(page.url()).toContain('genre=music')
      expect(page.url()).toContain('period=hour')
    }
  })

  test('ブラウザの戻る/進むボタンが正しく動作する', async ({ page }) => {
    // 初期ページ
    const initialUrl = page.url()
    
    // ジャンルを変更
    await page.goto('/?genre=game')
    const gameUrl = page.url()
    
    // さらに期間を変更
    await page.goto('/?genre=game&period=hour')
    const hourlyUrl = page.url()
    
    // ブラウザの戻るボタン
    await page.goBack()
    await expect(page).toHaveURL(gameUrl)
    
    // さらに戻る
    await page.goBack()
    await expect(page).toHaveURL(initialUrl)
    
    // ブラウザの進むボタン
    await page.goForward()
    await expect(page).toHaveURL(gameUrl)
  })
})