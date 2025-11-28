import { test, expect } from '@playwright/test'

test.describe('カスタムランキング - リダイレクト動作確認', () => {
  test('カスタムランキング選択時にbaseGenreのページにリダイレクトされる', async ({ page }) => {
    console.log('🧪 カスタムランキングリダイレクトテスト開始')
    
    // 事前にカスタムランキングを作成
    await page.addInitScript(() => {
      const customRanking = {
        version: "1.0",
        rankings: [
          {
            id: "test-game-ranking",
            title: "テスト用ゲームランキング",
            baseGenre: "game",
            conditions: [
              {
                tag: "実況プレイ",
                operator: "AND",
                tagType: "both"
              }
            ],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        selectedId: null
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
    })
    
    // ホームページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    
    // ジャンルセレクターをクリック
    const genreSelector = page.locator('[data-testid="genre-selector"], .genre-selector, button:has-text("すべて")')
    await genreSelector.first().click()
    await page.waitForTimeout(500)
    
    // カスタムジャンルを選択
    const customButton = page.locator('button:has-text("カスタム"), [data-genre="custom"], .genre-custom')
    await customButton.first().click()
    await page.waitForTimeout(1000)
    
    // カスタムランキングをクリック
    const customRankingButton = page.locator('button:has-text("テスト用ゲームランキング")')
    await customRankingButton.click()
    await page.waitForTimeout(1000)
    
    // URLがゲームジャンルになっていることを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    expect(currentUrl).toContain('genre=game')
    expect(currentUrl).not.toContain('genre=custom')
    expect(currentUrl).not.toContain('tag=custom:')
    
    // ゲームジャンルが選択されていることを確認
    const selectedGenre = page.locator('[data-testid="genre-selector"], .genre-selector, button[aria-pressed="true"], button.selected')
    const selectedText = await selectedGenre.textContent()
    console.log('✅ 選択されたジャンル:', selectedText)
    expect(selectedText).toContain('ゲーム')
    
    console.log('🎉 カスタムランキングリダイレクトテスト完了')
  })
  
  test('カスタムランキング作成後にbaseGenreのページにリダイレクトされる', async ({ page }) => {
    console.log('🧪 カスタムランキング作成後リダイレクトテスト開始')
    
    // ホームページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    
    // ジャンルセレクターをクリック
    const genreSelector = page.locator('[data-testid="genre-selector"], .genre-selector, button:has-text("すべて")')
    await genreSelector.first().click()
    await page.waitForTimeout(500)
    
    // カスタムジャンルを選択
    const customButton = page.locator('button:has-text("カスタム"), [data-genre="custom"], .genre-custom')
    await customButton.first().click()
    await page.waitForTimeout(1000)
    
    // 新規作成ボタンをクリック
    const createButton = page.locator('button:has-text("新しく作成"), button:has-text("作成する"), .create-custom-ranking')
    await createButton.click()
    await page.waitForTimeout(1000)
    
    // モーダルが開くのを待つ
    const modal = page.locator('[role="dialog"], .modal, .custom-ranking-modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // ベースジャンル（音楽）を選択
    const musicGenreButton = page.locator('button:has-text("音楽"), [data-genre="music"], .genre-music')
    await musicGenreButton.click()
    await page.waitForTimeout(500)
    
    // タイトルを入力（必要な場合）
    const titleInput = page.locator('input[placeholder*="タイトル"], input[name="title"], .title-input')
    if (await titleInput.isVisible()) {
      await titleInput.fill('テスト用音楽ランキング')
      await page.waitForTimeout(500)
    }
    
    // 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存"), button:has-text("作成"), .save-button')
    await saveButton.click()
    await page.waitForTimeout(2000)
    
    // URLが音楽ジャンルになっていることを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    expect(currentUrl).toContain('genre=music')
    expect(currentUrl).not.toContain('genre=custom')
    expect(currentUrl).not.toContain('tag=custom:')
    
    // 音楽ジャンルが選択されていることを確認
    const selectedGenre = page.locator('[data-testid="genre-selector"], .genre-selector, button[aria-pressed="true"], button.selected')
    const selectedText = await selectedGenre.textContent()
    console.log('✅ 選択されたジャンル:', selectedText)
    expect(selectedText).toContain('音楽')
    
    console.log('🎉 カスタムランキング作成後リダイレクトテスト完了')
  })
})