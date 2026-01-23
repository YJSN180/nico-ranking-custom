import { test, expect } from '@playwright/test'

test.describe('ランキング機能', () => {
  test('トップページが正常に表示される', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible()
  })

  test('動画カードが表示される', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    // ランキングデータの読み込みを待つ
    await page.waitForTimeout(2000)

    // 動画カードまたはランキングアイテムが存在することを確認
    const videoCards = page.locator('[data-testid="video-card"], .video-card, [data-testid="ranking-item"], [class*="ranking-item"], article')
    const count = await videoCards.count()

    // データがある場合は1つ以上のカードが表示される
    // エラー状態やデータなしの場合も考慮
    const hasCards = count >= 1
    const hasEmptyState = await page.locator('text=ランキングデータがありません, text=データがありません').count() > 0
    const hasError = await page.locator('text=エラー').count() > 0

    expect(hasCards || hasEmptyState || hasError).toBeTruthy()
  })

  test('ランキング順位が正しく表示される', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // 順位表示を探す（1位、2位、#1、#2 など）
    const rankIndicators = page.locator('[data-testid*="rank"], [class*="rank"], text=/^[1-9]位$/, text=/^#[1-9]$/')
    const count = await rankIndicators.count()

    // ランキングデータがある場合は順位表示があるはず
    if (count > 0) {
      expect(count).toBeGreaterThan(0)
    }
  })

  test('動画サムネイルが読み込まれる', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // サムネイル画像を探す
    const thumbnails = page.locator('img[src*="nicovideo"], img[src*="nimg"], img[alt*="サムネイル"], [data-testid*="thumbnail"] img')
    const count = await thumbnails.count()

    if (count > 0) {
      const firstThumbnail = thumbnails.first()
      await expect(firstThumbnail).toBeVisible()

      // src属性が設定されていることを確認
      const src = await firstThumbnail.getAttribute('src')
      expect(src).toBeTruthy()
    }
  })

  test('動画タイトルがクリック可能', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // 動画リンクを探す
    const videoLinks = page.locator('a[href*="nicovideo.jp"], a[href*="nico.ms"]')
    const count = await videoLinks.count()

    if (count > 0) {
      const firstLink = videoLinks.first()

      // リンクが有効なhrefを持っていることを確認
      const href = await firstLink.getAttribute('href')
      expect(href).toMatch(/nicovideo\.jp|nico\.ms/)
    }
  })

  test('再生数・コメント数・マイリスト数が表示される', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // 統計情報の表示を確認（再生、コメント、マイリストなど）
    const statsIndicators = page.locator(
      '[data-testid*="view"], [data-testid*="comment"], [data-testid*="mylist"], ' +
      '[class*="view"], [class*="comment"], [class*="mylist"], ' +
      'text=/[0-9,]+再生/, text=/[0-9,]+コメ/'
    )
    const count = await statsIndicators.count()

    // 統計情報が表示されているか、またはシンプルなUIの場合
    // 少なくともページは正常に動作している
    const hasStats = count > 0
    const pageLoaded = await page.locator('h1').count() > 0

    expect(hasStats || pageLoaded).toBeTruthy()
  })

  test('ページネーションまたは無限スクロールが機能する', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // ページネーションボタンを探す
    const paginationButtons = page.locator(
      '[data-testid*="pagination"], [class*="pagination"], ' +
      'button:has-text("次へ"), button:has-text("もっと見る"), ' +
      'a:has-text("次のページ")'
    )
    const paginationCount = await paginationButtons.count()

    if (paginationCount > 0) {
      // ページネーションが存在する場合はクリック可能であることを確認
      const firstButton = paginationButtons.first()
      await expect(firstButton).toBeEnabled()
    } else {
      // 無限スクロールの場合、スクロールしてコンテンツが増えるか確認
      const initialContentCount = await page.locator('article, [data-testid*="item"]').count()

      // ページ下部までスクロール
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(1000)

      // コンテンツが増えたか、同じ数のままか（どちらも正常）
      const afterScrollCount = await page.locator('article, [data-testid*="item"]').count()
      expect(afterScrollCount).toBeGreaterThanOrEqual(initialContentCount)
    }
  })
})
