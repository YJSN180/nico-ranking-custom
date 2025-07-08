import { test, expect } from '@playwright/test'

// TODO: 設定モーダルの開閉に問題があるため一時的にスキップ
// Issue: タブボタンのテキストにnbspが含まれており、セレクタがマッチしない
// 修正後に再度有効化する必要がある
test.describe('ジャンル自動切り替え機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('選択中のジャンルが非表示になったら自動的に切り替わる', async ({ page }) => {
    // 音楽ジャンルを選択
    await page.getByRole('button', { name: '音楽' }).click()
    await page.waitForTimeout(500)
    
    // 音楽ランキングが表示されていることを確認
    await expect(page.url()).toContain('genre=music')
    
    // 設定モーダルを開く
    await page.locator('button[aria-label="設定"]').click()
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    await page.waitForTimeout(500)
    
    // ジャンルタブを開く
    await page.locator('[role="dialog"] button').filter({ hasText: 'ジャンル' }).click()
    await page.waitForTimeout(500)
    
    // 全ジャンルを非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // ゲームジャンルのみを表示する
    const gameItem = page.locator('[data-genre="game"]')
    await gameItem.locator('button[aria-label*="表示"]').click()
    await page.waitForTimeout(100)
    
    // 適用ボタンをクリック
    await page.getByRole('button', { name: '適用' }).click()
    
    // ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // 自動的にゲームジャンルに切り替わっていることを確認
    await expect(page.url()).toContain('genre=game')
    
    // ゲームランキングが表示されていることを確認
    const firstItem = page.locator('[data-testid="ranking-item"]').first()
    await expect(firstItem).toBeVisible()
  })

  test('複数ジャンルを再表示した場合は最初のジャンルに切り替わる', async ({ page }) => {
    // アニメジャンルを選択
    await page.getByRole('button', { name: 'アニメ' }).click()
    await page.waitForTimeout(500)
    
    // アニメランキングが表示されていることを確認
    await expect(page.url()).toContain('genre=anime')
    
    // 設定モーダルを開く
    await page.locator('button[aria-label="設定"]').click()
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    await page.waitForTimeout(500)
    
    // ジャンルタブを開く
    await page.locator('[role="dialog"] button').filter({ hasText: 'ジャンル' }).click()
    await page.waitForTimeout(500)
    
    // 全ジャンルを非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // 総合と音楽を表示する（アニメは非表示のまま）
    const allItem = page.locator('[data-genre="all"]')
    const musicItem = page.locator('[data-genre="music"]')
    
    await allItem.locator('button[aria-label*="表示"]').click()
    await page.waitForTimeout(100)
    await musicItem.locator('button[aria-label*="表示"]').click()
    await page.waitForTimeout(100)
    
    // 適用ボタンをクリック
    await page.getByRole('button', { name: '適用' }).click()
    
    // ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // 自動的に総合ジャンルに切り替わっていることを確認（最初の表示可能ジャンル）
    await expect(page.url()).toContain('genre=all')
    
    // ジャンルセレクターに総合と音楽のみが表示されていることを確認
    const genreButtons = page.locator('.selectors-container button').filter({ hasText: /^(総合|音楽)$/ })
    await expect(genreButtons).toHaveCount(2)
  })

  test('選択中のジャンルが再表示対象に含まれている場合はそのまま維持', async ({ page }) => {
    // 音楽ジャンルを選択
    await page.getByRole('button', { name: '音楽' }).click()
    await page.waitForTimeout(500)
    
    // 音楽ランキングが表示されていることを確認
    await expect(page.url()).toContain('genre=music')
    
    // 設定モーダルを開く
    await page.locator('button[aria-label="設定"]').click()
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    await page.waitForTimeout(500)
    
    // ジャンルタブを開く
    await page.locator('[role="dialog"] button').filter({ hasText: 'ジャンル' }).click()
    await page.waitForTimeout(500)
    
    // ゲームジャンルを非表示にする（音楽は表示のまま）
    const gameItem = page.locator('[data-genre="game"]')
    await gameItem.locator('button[aria-label*="非表示"]').click()
    await page.waitForTimeout(100)
    
    // 適用ボタンをクリック
    await page.getByRole('button', { name: '適用' }).click()
    
    // ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // 音楽ジャンルのままであることを確認
    await expect(page.url()).toContain('genre=music')
    
    // 音楽ランキングが引き続き表示されていることを確認
    const firstItem = page.locator('[data-testid="ranking-item"]').first()
    await expect(firstItem).toBeVisible()
  })
})