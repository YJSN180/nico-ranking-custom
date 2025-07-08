import { test, expect } from '@playwright/test'

// TODO: 設定モーダルの開閉に問題があるため一時的にスキップ
// Issue: タブボタンのテキストにnbspが含まれており、セレクタがマッチしない
// 修正後に再度有効化する必要がある
test.describe('ジャンル順序 - すべて表示/非表示機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // 設定モーダルを開く
    await page.locator('button[aria-label="設定"]').click()
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    await page.waitForTimeout(500)
    
    // ジャンルタブを開く
    await page.locator('[role="dialog"] button').filter({ hasText: 'ジャンル' }).click()
    await page.waitForTimeout(500)
  })

  test('すべて表示/非表示ボタンが表示される', async ({ page }) => {
    // 3つのボタンが表示されることを確認
    const resetButton = page.getByRole('button', { name: 'デフォルトに戻す' })
    const showAllButton = page.getByRole('button', { name: 'すべて表示にする' })
    const hideAllButton = page.getByRole('button', { name: 'すべて非表示にする' })
    
    await expect(resetButton).toBeVisible()
    await expect(showAllButton).toBeVisible()
    await expect(hideAllButton).toBeVisible()
  })

  test('すべて非表示にするボタンをクリックするとすべてのジャンルが非表示になる', async ({ page }) => {
    // 初期状態では総合ジャンルが表示されている
    const allGenreItem = page.locator('[data-genre="all"]')
    await expect(allGenreItem).not.toHaveClass(/hidden/)
    
    // すべて非表示にするボタンをクリック
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になることを確認
    const genreItems = page.locator('[data-genre]')
    const count = await genreItems.count()
    
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      await expect(item).toHaveClass(/hidden/)
    }
  })

  test('すべて非表示状態から適用すると「表示する動画がありません」が表示される', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // 適用ボタンをクリック
    await page.getByRole('button', { name: '適用' }).click()
    
    // ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // 「表示する動画がありません」というメッセージが表示されることを確認
    await expect(page.getByText('表示する動画がありません')).toBeVisible()
    
    // ジャンルセレクターに「すべてのジャンルが非表示になっています」と表示される
    await expect(page.getByText('すべてのジャンルが非表示になっています')).toBeVisible()
  })

  test('すべて非表示状態からデフォルトに戻すことができる', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になったことを確認
    const hiddenItems = page.locator('[data-genre].hidden')
    await expect(hiddenItems).toHaveCount(23)
    
    // デフォルトに戻す
    await page.getByRole('button', { name: 'デフォルトに戻す' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが表示されることを確認
    const visibleItems = page.locator('[data-genre]:not(.hidden)')
    await expect(visibleItems).toHaveCount(23)
  })

  test('すべて非表示にしてから一部のジャンルを表示できる', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // 音楽ジャンルを表示する
    const musicItem = page.locator('[data-genre="music"]')
    const musicToggle = musicItem.locator('button[aria-label*="表示"]')
    await musicToggle.click()
    await page.waitForTimeout(100)
    
    // 音楽ジャンルのみが表示されることを確認
    await expect(musicItem).not.toHaveClass(/hidden/)
    
    // 他のジャンルは非表示のまま
    const otherItems = page.locator('[data-genre]:not([data-genre="music"])')
    const otherCount = await otherItems.count()
    
    for (let i = 0; i < otherCount; i++) {
      const item = otherItems.nth(i)
      await expect(item).toHaveClass(/hidden/)
    }
  })

  test('すべて表示にするボタンでジャンルが全て表示される', async ({ page }) => {
    // まず一部のジャンルを非表示にする
    const musicItem = page.locator('[data-genre="music"]')
    const gameItem = page.locator('[data-genre="game"]')
    const animeItem = page.locator('[data-genre="anime"]')
    
    await musicItem.locator('button[aria-label*="非表示"]').click()
    await page.waitForTimeout(100)
    await gameItem.locator('button[aria-label*="非表示"]').click()
    await page.waitForTimeout(100)
    await animeItem.locator('button[aria-label*="非表示"]').click()
    await page.waitForTimeout(100)
    
    // 3つのジャンルが非表示になったことを確認
    await expect(musicItem).toHaveClass(/hidden/)
    await expect(gameItem).toHaveClass(/hidden/)
    await expect(animeItem).toHaveClass(/hidden/)
    
    // すべて表示にするボタンをクリック
    await page.getByRole('button', { name: 'すべて表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが表示されることを確認
    const genreItems = page.locator('[data-genre]')
    const count = await genreItems.count()
    
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      await expect(item).not.toHaveClass(/hidden/)
    }
  })

  test('すべて表示とすべて非表示を交互に切り替えできる', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になったことを確認
    let hiddenCount = await page.locator('[data-genre].hidden').count()
    expect(hiddenCount).toBe(23)
    
    // すべて表示にする
    await page.getByRole('button', { name: 'すべて表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが表示されることを確認
    let visibleCount = await page.locator('[data-genre]:not(.hidden)').count()
    expect(visibleCount).toBe(23)
    
    // 再度すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になったことを確認
    hiddenCount = await page.locator('[data-genre].hidden').count()
    expect(hiddenCount).toBe(23)
  })
})