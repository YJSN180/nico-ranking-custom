import { test, expect } from '@playwright/test'

test.describe('デバッグテスト', () => {
  test('設定ボタンのデバッグ', async ({ page }) => {
    // ページに移動
    await page.goto('/')
    
    // ページが完全に読み込まれるまで待つ
    await page.waitForLoadState('networkidle')
    
    // コンソールメッセージを監視
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`)
    })
    
    // エラーを監視
    page.on('pageerror', error => {
      console.log(`[Page Error] ${error.message}`)
    })
    
    // 設定ボタンを探す
    const settingsButton = page.locator('button[aria-label="設定"]')
    
    // ボタンが存在することを確認
    await expect(settingsButton).toBeVisible()
    console.log('設定ボタンが見つかりました')
    
    // ボタンの情報を取得
    const buttonText = await settingsButton.textContent()
    console.log(`ボタンのテキスト: "${buttonText}"`)
    
    // クリック前のDOM構造を確認
    const bodyBefore = await page.locator('body').innerHTML()
    console.log(`モーダル要素の数（クリック前）: ${(bodyBefore.match(/modal/gi) || []).length}`)
    
    // ボタンをクリック
    await settingsButton.click()
    console.log('設定ボタンをクリックしました')
    
    // 少し待つ
    await page.waitForTimeout(1000)
    
    // クリック後のDOM構造を確認
    const bodyAfter = await page.locator('body').innerHTML()
    console.log(`モーダル要素の数（クリック後）: ${(bodyAfter.match(/modal/gi) || []).length}`)
    
    // すべての要素でmodalを含むクラス名を持つものを探す
    const modalElements = await page.locator('[class*="modal"]').count()
    console.log(`CSSクラスにmodalを含む要素数: ${modalElements}`)
    
    // overlayを含むクラス名を持つ要素を探す
    const overlayElements = await page.locator('[class*="overlay"]').count()
    console.log(`CSSクラスにoverlayを含む要素数: ${overlayElements}`)
    
    // h2要素を探す
    const h2Elements = await page.locator('h2').allTextContents()
    console.log(`h2要素: ${h2Elements.join(', ')}`)
    
    // スクリーンショットを撮る
    await page.screenshot({ path: 'debug-after-click.png', fullPage: true })
    console.log('スクリーンショットを保存しました: debug-after-click.png')
  })
})