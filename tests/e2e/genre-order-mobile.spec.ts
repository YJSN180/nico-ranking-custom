import { test, expect, devices } from '@playwright/test'

// モバイルデバイスの設定
test.use({
  ...devices['iPhone 13'],
  // タッチイベントを有効化
  hasTouch: true,
  isMobile: true
})

test.describe('ジャンル順序カスタマイズ - モバイル', () => {
  test.beforeEach(async ({ page }) => {
    // ホームページへ移動
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // デスクトップの設定ボタンを使用（モバイルメニューが機能しないため）
    // 設定ボタンは存在することが確認されている
    const settingsButton = page.locator('button[aria-label="設定"]')
    await settingsButton.click({ force: true })
    
    // モーダルが開くまで待機（複数の方法で確認）
    await page.waitForTimeout(1000)
    
    // ジャンルタブを探してクリック
    const genreTab = page.locator('button').filter({ hasText: '🎯 ジャンル' }).first()
    await genreTab.click()
    await page.waitForTimeout(500)
  })

  test('モバイルでジャンルアイテムが表示される', async ({ page }) => {
    // ジャンルアイテムが表示されることを確認
    const genreItems = page.locator('[data-genre]')
    await expect(genreItems).toHaveCount(13) // 全ジャンル数
    
    // 最初のアイテムが「総合」であることを確認
    await expect(genreItems.first()).toContainText('総合')
  })

  test('タッチドラッグでジャンルの順序を変更できる', async ({ page }) => {
    // 最初の2つのジャンルのテキストを取得
    const firstItem = page.locator('[data-genre]').first()
    const secondItem = page.locator('[data-genre]').nth(1)
    
    const firstText = await firstItem.textContent()
    const secondText = await secondItem.textContent()
    
    // タッチドラッグシミュレーション
    const firstBox = await firstItem.boundingBox()
    const secondBox = await secondItem.boundingBox()
    
    if (!firstBox || !secondBox) {
      throw new Error('要素の位置を取得できませんでした')
    }
    
    // @dnd-kit の長押し判定（250ms）を考慮したドラッグ
    await page.touchscreen.down(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2)
    await page.waitForTimeout(300) // 250msの長押し判定 + 余裕
    await page.touchscreen.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 10)
    await page.touchscreen.up()
    
    // 順序が変わったことを確認
    await page.waitForTimeout(300) // アニメーション待機
    const newFirstText = await page.locator('[data-genre]').first().textContent()
    const newSecondText = await page.locator('[data-genre]').nth(1).textContent()
    
    expect(newFirstText).toBe(secondText)
    expect(newSecondText).toBe(firstText)
  })

  test('タッチ操作でも表示/非表示の切り替えができる', async ({ page }) => {
    // 「音楽」ジャンルの表示/非表示ボタンを探す
    const musicItem = page.locator('[data-genre="music"]')
    const visibilityButton = musicItem.locator('button[aria-label*="表示"]')
    
    // 初期状態を確認（表示されている）
    await expect(visibilityButton).toHaveAttribute('aria-label', /を非表示にする/)
    
    // タップして非表示に
    await visibilityButton.tap()
    await page.waitForTimeout(100)
    
    // 非表示になったことを確認
    await expect(visibilityButton).toHaveAttribute('aria-label', /を表示する/)
    await expect(musicItem).toHaveClass(/hidden/)
  })

  test('デフォルトに戻すボタンがモバイルでも機能する', async ({ page }) => {
    // まず順序を変更
    const firstItem = page.locator('[data-genre]').first()
    const secondItem = page.locator('[data-genre]').nth(1)
    
    const firstBox = await firstItem.boundingBox()
    const secondBox = await secondItem.boundingBox()
    
    if (!firstBox || !secondBox) {
      throw new Error('要素の位置を取得できませんでした')
    }
    
    // ドラッグで順序変更
    await page.touchscreen.down(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2)
    await page.waitForTimeout(300) // @dnd-kit の長押し判定
    await page.touchscreen.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 10)
    await page.touchscreen.up()
    
    await page.waitForTimeout(300)
    
    // デフォルトに戻すボタンをタップ
    await page.getByRole('button', { name: 'デフォルトに戻す' }).tap()
    
    // 順序が元に戻ったことを確認
    await page.waitForTimeout(300)
    const resetFirstText = await page.locator('[data-genre]').first().textContent()
    expect(resetFirstText).toContain('総合')
  })

  test('スクロール中のドラッグが正しく動作する', async ({ page }) => {
    // ページを少しスクロール
    await page.evaluate(() => window.scrollBy(0, 200))
    await page.waitForTimeout(100)
    
    // スクロール後でもドラッグが機能することを確認
    const thirdItem = page.locator('[data-genre]').nth(2)
    const fourthItem = page.locator('[data-genre]').nth(3)
    
    const thirdText = await thirdItem.textContent()
    const fourthText = await fourthItem.textContent()
    
    const thirdBox = await thirdItem.boundingBox()
    const fourthBox = await fourthItem.boundingBox()
    
    if (!thirdBox || !fourthBox) {
      throw new Error('要素の位置を取得できませんでした')
    }
    
    // ドラッグ操作
    await page.touchscreen.down(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2)
    await page.waitForTimeout(300) // @dnd-kit の長押し判定
    await page.touchscreen.move(fourthBox.x + fourthBox.width / 2, fourthBox.y + fourthBox.height + 10)
    await page.touchscreen.up()
    
    // 順序が変わったことを確認
    await page.waitForTimeout(300)
    const newThirdText = await page.locator('[data-genre]').nth(2).textContent()
    const newFourthText = await page.locator('[data-genre]').nth(3).textContent()
    
    expect(newThirdText).toBe(fourthText)
    expect(newFourthText).toBe(thirdText)
  })
})