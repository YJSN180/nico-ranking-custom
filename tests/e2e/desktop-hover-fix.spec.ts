import { test, expect } from '@playwright/test'

test.describe('デスクトップ版マイリストモーダル閉じ後のホバー状態修正', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?genre=all&term=24h')
    await page.waitForSelector('[data-testid="ranking-item"]')
  })

  test('マイリストモーダルを閉じた後、ホバー状態がリセットされる', async ({ page, browserName }) => {
    // Firefoxはスキップ（ホバー動作が異なるため）
    test.skip(browserName === 'firefox', 'Firefox has different hover behavior')
    
    // 最初の動画アイテムを取得
    const firstItem = page.locator('[data-testid="ranking-item"]').first()
    const videoId = await firstItem.getAttribute('data-video-id')
    
    // 初期状態の背景色を取得
    const initialBgColor = await firstItem.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    )
    
    // マイリストボタンを探す（デスクトップ版）
    const mylistButton = firstItem.locator('.ranking-item-responsive__mylist-area button')
    
    // マイリストボタンをクリック
    await mylistButton.click()
    
    // モーダルが表示されることを確認
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible()
    
    // モーダルの閉じるボタンをクリック
    const closeButton = page.locator('[aria-label="閉じる"]')
    await closeButton.click()
    
    // モーダルが閉じたことを確認
    await expect(page.locator('[data-testid="modal-overlay"]')).not.toBeVisible()
    
    // 少し待つ（状態リセット処理のため）
    await page.waitForTimeout(200)
    
    // 背景色が初期状態に戻ることを確認
    const afterCloseBgColor = await firstItem.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    )
    
    expect(afterCloseBgColor).toBe(initialBgColor)
  })

  test('モーダルを閉じた後、再度ホバーが正常に動作する', async ({ page, browserName }) => {
    // Firefoxはスキップ
    test.skip(browserName === 'firefox', 'Firefox has different hover behavior')
    
    const firstItem = page.locator('[data-testid="ranking-item"]').first()
    const mylistButton = firstItem.locator('.ranking-item-responsive__mylist-area button')
    
    // マイリストボタンをクリック
    await mylistButton.click()
    
    // モーダルを閉じる
    await page.locator('[aria-label="閉じる"]').click()
    await expect(page.locator('[data-testid="modal-overlay"]')).not.toBeVisible()
    
    // 少し待つ
    await page.waitForTimeout(200)
    
    // 動画アイテムから一度離れる
    await page.mouse.move(0, 0)
    await page.waitForTimeout(100)
    
    // 再度ホバー
    const box = await firstItem.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(100)
      
      // ホバー時の背景色を確認
      const hoverBgColor = await firstItem.evaluate(el => 
        window.getComputedStyle(el).backgroundColor
      )
      
      // var(--surface-hover)の値を取得
      const expectedHoverColor = await page.evaluate(() => 
        getComputedStyle(document.documentElement).getPropertyValue('--surface-hover')
      )
      
      // RGB値に変換して比較（CSSカスタムプロパティの場合）
      const rgbHoverColor = await page.evaluate((color) => {
        const div = document.createElement('div')
        div.style.backgroundColor = color
        document.body.appendChild(div)
        const rgb = window.getComputedStyle(div).backgroundColor
        document.body.removeChild(div)
        return rgb
      }, expectedHoverColor.trim())
      
      expect(hoverBgColor).toBe(rgbHoverColor)
    }
  })
})