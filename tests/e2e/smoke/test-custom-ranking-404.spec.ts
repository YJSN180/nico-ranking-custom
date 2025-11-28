import { test, expect } from '@playwright/test'

test.describe('カスタムランキング404エラー修正の検証', () => {
  test.beforeEach(async ({ page }) => {
    // 開発サーバーにアクセス
    await page.goto('http://localhost:3000')
    
    // ページが完全に読み込まれるのを待つ
    await page.waitForLoadState('networkidle')
  })

  test('新規カスタムランキング作成時に404エラーが発生しないこと', async ({ page }) => {
    // カスタムランキングタブをクリック
    await page.click('button:has-text("カスタム")')
    await page.waitForTimeout(500)
    
    // 「＋ 新しく作成する」ボタンをクリック
    await page.click('button:has-text("＋ 新しく作成する")')
    await page.waitForTimeout(500)
    
    // モーダルが表示されるのを待つ
    await expect(page.locator('text=カスタムランキングを作成')).toBeVisible()
    
    // タイトルを入力
    const testTitle = `テストランキング_${Date.now()}`
    await page.fill('input[placeholder="例: 歌ってみた新人ランキング"]', testTitle)
    
    // ベースジャンルを選択（音楽）
    await page.click('button:has-text("音楽")')
    
    // ステップ2へ進む
    await page.click('button:has-text("次へ")')
    await page.waitForTimeout(500)
    
    // タグを入力
    await page.fill('input[placeholder="タグを入力"]', '歌ってみた')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    
    // 保存ボタンをクリック
    await page.click('button:has-text("保存")')
    
    // エラーメッセージが表示されていないことを確認
    await page.waitForTimeout(2000) // 少し待つ
    const errorElement = page.locator('text=エラー: HTTP 404:')
    await expect(errorElement).not.toBeVisible()
    
    // カスタムランキングが正しく表示されていることを確認
    await expect(page.locator(`text=${testTitle}`)).toBeVisible()
    
    // コンソールエラーがないことを確認
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    
    await page.waitForTimeout(1000)
    expect(consoleErrors.filter(e => e.includes('404'))).toHaveLength(0)
  })
  
  test('カスタムランキング切り替え時にエラーが発生しないこと', async ({ page }) => {
    // カスタムランキングタブをクリック
    await page.click('button:has-text("カスタム")')
    await page.waitForTimeout(500)
    
    // 既存のカスタムランキングがある場合、それをクリック
    const customRankings = page.locator('button').filter({ hasText: /^(?!.*新しく作成).*$/ })
    const count = await customRankings.count()
    
    if (count >= 2) {
      // 最初のカスタムランキングをクリック
      await customRankings.nth(0).click()
      await page.waitForTimeout(1000)
      
      // エラーが表示されていないことを確認
      const errorElement = page.locator('text=エラー: HTTP 404:')
      await expect(errorElement).not.toBeVisible()
      
      // 2番目のカスタムランキングをクリック
      await customRankings.nth(1).click()
      await page.waitForTimeout(1000)
      
      // エラーが表示されていないことを確認
      await expect(errorElement).not.toBeVisible()
    }
  })
  
  test('カスタムランキングから通常ランキングへの切り替えが正常に動作すること', async ({ page }) => {
    // カスタムランキングタブをクリック
    await page.click('button:has-text("カスタム")')
    await page.waitForTimeout(500)
    
    // 総合ランキングに切り替え
    await page.click('button:has-text("総合")')
    await page.waitForTimeout(1000)
    
    // エラーが表示されていないことを確認
    const errorElement = page.locator('text=エラー:')
    await expect(errorElement).not.toBeVisible()
    
    // ランキングデータが表示されていることを確認
    await expect(page.locator('.ranking-item').first()).toBeVisible()
  })
})