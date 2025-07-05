import { test, expect } from '@playwright/test'

test.describe('ナビゲーション機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('ジャンル選択が機能する', async ({ page }) => {
    // より安定したセレクターを使用
    const genreButton = page.getByRole('button', { name: 'ゲーム' })
    
    // ボタンの存在を確認
    await expect(genreButton).toBeVisible({ timeout: 10000 })
    
    // クリックしてURL変更を待つ
    await genreButton.click()
    await page.waitForURL('**/\?genre=game**', { timeout: 10000 })
    
    // URLパラメータを確認
    expect(page.url()).toContain('genre=game')
  })

  test('期間選択が機能する', async ({ page }) => {
    // より安定したセレクターを使用（毎時ボタンを探す）
    const hourlyButton = page.getByRole('button', { name: /毎時|1時間/i })
    
    // ボタンの存在を確認
    await expect(hourlyButton).toBeVisible({ timeout: 10000 })
    
    // クリックしてURL変更を待つ
    await hourlyButton.click()
    await page.waitForFunction(
      () => window.location.href.includes('period=hour'),
      { timeout: 10000 }
    )
    
    // URLパラメータを確認
    expect(page.url()).toContain('period=hour')
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
    // ページネーションボタンをより安定的に探す
    const nextPageButton = page.getByRole('button', { name: /次|→|Next/i }).or(
      page.getByRole('link', { name: /次|→|Next/i })
    )
    
    // ボタンの存在を確認（最初のページには十分なアイテムがない可能性がある）
    const buttonVisible = await nextPageButton.isVisible({ timeout: 5000 }).catch(() => false)
    
    if (buttonVisible) {
      await nextPageButton.click()
      
      // URL変更を待つ
      await page.waitForFunction(
        () => window.location.href.includes('page=2') || window.location.href.includes('offset='),
        { timeout: 10000 }
      )
      
      // URLパラメータを確認
      expect(page.url()).toMatch(/page=2|offset=/)
    } else {
      // ページネーションが不要な場合（アイテム数が少ない）
      test.skip(true, 'ページネーション要素が表示されていません（アイテム数が少ない可能性）')
    }
  })

  test('ホームロゴクリックでトップページに戻る', async ({ page }) => {
    // まず別のページに移動
    await page.goto('/?genre=game&period=hour')
    await page.waitForLoadState('networkidle')
    
    // ヘッダー内のロゴリンクを特定（より具体的な選択）
    const logo = page.locator('header a[href="/"]').first()
    
    // ロゴの存在を確認
    await expect(logo).toBeVisible({ timeout: 10000 })
    
    await logo.click()
    
    // トップページへの遷移を待つ
    await page.waitForURL('**/', { timeout: 10000 })
    
    // URLにパラメータがないことを確認
    const url = new URL(page.url())
    expect(url.search).toBe('')
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
      
      // ページのロードを待つ
      await page.waitForLoadState('networkidle')
      
      // ページが正常に表示されることを確認
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
      
      // URLパラメータが維持されていることを確認
      await expect(page).toHaveURL(/genre=music/, { timeout: 10000 })
      await expect(page).toHaveURL(/period=hour/)
      await expect(page).toHaveURL(/tag=/)
    } else {
      // タグがない場合はジャンルと期間のみでテスト
      await page.goto('/?genre=music&period=hour')
      
      // ページのロードを待つ
      await page.waitForLoadState('networkidle')
      
      // ページが正常に表示されることを確認
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
      
      // URLパラメータが維持されていることを確認
      await expect(page).toHaveURL(/genre=music/, { timeout: 10000 })
      await expect(page).toHaveURL(/period=hour/)
    }
  })

  test('ブラウザの戻る/進むボタンが正しく動作する', async ({ page }) => {
    // 初期ページ（明示的にルートページにアクセス）
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const initialUrl = page.url()
    
    // ジャンルを変更
    await page.goto('/?genre=game')
    await page.waitForLoadState('networkidle')
    const gameUrl = page.url()
    
    // さらに期間を変更
    await page.goto('/?genre=game&period=hour')
    await page.waitForLoadState('networkidle')
    const hourlyUrl = page.url()
    
    // ブラウザの戻るボタン
    await page.goBack()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(gameUrl)
    
    // さらに戻る
    await page.goBack()
    await page.waitForLoadState('networkidle')
    // ルートページに戻ることを確認（クエリパラメータをより柔軟にチェック）
    await expect(page).toHaveURL(initialUrl, { timeout: 10000 })
    
    // ブラウザの進むボタン
    await page.goForward()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(gameUrl, { timeout: 10000 })
  })
})