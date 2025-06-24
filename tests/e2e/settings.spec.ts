import { test, expect, Page } from '@playwright/test'

test.describe('設定機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // ページが完全に読み込まれるまで待つ
    await page.waitForLoadState('networkidle')
    
    // 設定ボタンが表示されるまで待つ
    const settingsButton = page.locator('button[aria-label="設定"]')
    await expect(settingsButton).toBeVisible({ timeout: 10000 })
    
    // 設定モーダルを開く
    await settingsButton.click()
    
    // モーダルが表示されるまで待つ
    await expect(page.locator('.modal, [role="dialog"]').first()).toBeVisible({ timeout: 10000 })
  })

  test('設定モーダルの開閉が正しく動作する', async ({ page }) => {
    // モーダルが開いていることを確認
    const modal = page.locator('.modal, [role="dialog"]').first()
    await expect(modal).toBeVisible()
    
    // 閉じるボタンで閉じる
    await page.click('button:has-text("×")')
    await expect(modal).not.toBeVisible()
    
    // 再度開く
    await page.click('button[aria-label="設定"]')
    await expect(modal).toBeVisible()
    
    // オーバーレイクリックで閉じる
    await page.click('.overlay', { position: { x: 10, y: 10 } })
    await expect(modal).not.toBeVisible()
  })

  test('テーマ切り替えが即座に反映される', async ({ page }) => {
    // 表示設定タブを選択
    await page.click('button:has-text("表示設定")')
    
    // 初期テーマを確認
    const htmlElement = page.locator('html')
    const initialTheme = await htmlElement.getAttribute('data-theme')
    
    // ダークモードに切り替え
    await page.click('label:has-text("ダークモード")')
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark')
    
    // ライトモードに切り替え
    await page.click('label:has-text("ライトモード")')
    await expect(htmlElement).toHaveAttribute('data-theme', 'light')
    
    // ダークブルーに切り替え
    await page.click('label:has-text("ダークブルー")')
    await expect(htmlElement).toHaveAttribute('data-theme', 'darkblue')
    
    // モーダルを閉じても設定が維持される
    await page.click('button:has-text("閉じる")')
    await expect(htmlElement).toHaveAttribute('data-theme', 'darkblue')
    
    // ページリロード後も設定が維持される
    await page.reload()
    await expect(htmlElement).toHaveAttribute('data-theme', 'darkblue')
  })

  test('NGリスト - 動画IDの追加と削除', async ({ page }) => {
    // NGリスト管理タブを選択
    await page.click('button:has-text("NGリスト管理")')
    
    // 動画IDを追加
    const videoIdInput = page.locator('input[placeholder="sm12345678"]')
    await videoIdInput.fill('sm12345678')
    await videoIdInput.press('Enter')
    
    // 追加されたことを確認
    await expect(page.locator('text=sm12345678')).toBeVisible()
    
    // 変更未保存の表示を確認
    await expect(page.locator('text=(未保存)')).toBeVisible()
    
    // さらに追加
    await videoIdInput.fill('sm87654321')
    await page.click('button:has-text("追加"):near(input[placeholder="sm12345678"])')
    await expect(page.locator('text=sm87654321')).toBeVisible()
    
    // 削除
    await page.click('button:has-text("×"):near(text=sm12345678)')
    await expect(page.locator('text=sm12345678')).not.toBeVisible()
    
    // 適用ボタンで保存
    await page.click('button:has-text("適用")')
    await expect(page.locator('text=(未保存)')).not.toBeVisible()
  })

  test('NGリスト - 動画タイトルの完全一致と部分一致', async ({ page }) => {
    await page.click('button:has-text("NGリスト管理")')
    
    // 完全一致で追加
    await page.check('input[type="radio"][value="exact"]:near(text=動画タイトル)')
    const titleInput = page.locator('input[placeholder="タイトルを入力"]')
    await titleInput.fill('テスト動画タイトル')
    await titleInput.press('Enter')
    
    await expect(page.locator('text=テスト動画タイトル (完全)')).toBeVisible()
    
    // 部分一致に切り替えて追加
    await page.check('input[type="radio"][value="partial"]:near(text=動画タイトル)')
    await titleInput.fill('広告')
    await titleInput.press('Enter')
    
    await expect(page.locator('text=広告 (部分)')).toBeVisible()
    
    // 適用
    await page.click('button:has-text("適用")')
  })

  test('NGリスト - 投稿者の管理', async ({ page }) => {
    await page.click('button:has-text("NGリスト管理")')
    
    // 投稿者IDを追加
    const authorIdInput = page.locator('input[placeholder="投稿者ID"]')
    await authorIdInput.fill('123456')
    await authorIdInput.press('Enter')
    
    await expect(page.locator('text=ID: 123456')).toBeVisible()
    
    // 投稿者名を追加（完全一致）
    await page.check('input[type="radio"][value="exact"]:near(text=名前)')
    const authorNameInput = page.locator('input[placeholder="投稿者名"]')
    await authorNameInput.fill('テスト投稿者')
    await authorNameInput.press('Enter')
    
    await expect(page.locator('text=名前: テスト投稿者 (完全)')).toBeVisible()
    
    // 部分一致で追加
    await page.check('input[type="radio"][value="partial"]:near(text=名前)')
    await authorNameInput.fill('bot')
    await authorNameInput.press('Enter')
    
    await expect(page.locator('text=名前: bot (部分)')).toBeVisible()
    
    // 適用
    await page.click('button:has-text("適用")')
  })

  test('NGリスト変更時の確認ダイアログ', async ({ page }) => {
    await page.click('button:has-text("NGリスト管理")')
    
    // 変更を加える
    const input = page.locator('input[placeholder="sm12345678"]')
    await input.fill('sm99999999')
    await input.press('Enter')
    
    // ダイアログハンドラーを設定
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('変更を破棄してもよろしいですか')
      dialog.dismiss() // キャンセル
    })
    
    // 閉じるボタンをクリック
    await page.click('button:has-text("閉じる")')
    
    // モーダルがまだ開いていることを確認
    await expect(page.locator('.modal, [role="dialog"]').first()).toBeVisible()
    
    // 今度は承認する
    page.removeAllListeners('dialog')
    page.on('dialog', dialog => {
      dialog.accept() // OK
    })
    
    await page.click('button:has-text("閉じる")')
    
    // モーダルが閉じたことを確認
    await expect(page.locator('.modal, [role="dialog"]').first()).not.toBeVisible()
  })

  test('NGリストの統計表示', async ({ page }) => {
    await page.click('button:has-text("NGリスト管理")')
    
    // 初期状態の確認
    const stats = page.locator('text=/NGリスト: \\d+件/')
    await expect(stats).toBeVisible()
    const initialCount = await stats.textContent()
    
    // アイテムを追加
    await page.fill('input[placeholder="sm12345678"]', 'sm11111111')
    await page.press('input[placeholder="sm12345678"]', 'Enter')
    
    await page.fill('input[placeholder="sm12345678"]', 'sm22222222')
    await page.press('input[placeholder="sm12345678"]', 'Enter')
    
    // カウントが増えていることを確認
    const newCount = await stats.textContent()
    expect(newCount).not.toBe(initialCount)
  })

  test('タブ切り替えが正しく動作する', async ({ page }) => {
    // 初期状態はNGリスト管理タブ
    await expect(page.locator('button:has-text("NGリスト管理").active')).toBeVisible()
    await expect(page.locator('h3:has-text("動画ID")')).toBeVisible()
    
    // 表示設定タブに切り替え
    await page.click('button:has-text("表示設定")')
    await expect(page.locator('button:has-text("表示設定").active')).toBeVisible()
    await expect(page.locator('legend:has-text("テーマ設定")')).toBeVisible()
    
    // NGリスト管理タブに戻る
    await page.click('button:has-text("NGリスト管理")')
    await expect(page.locator('button:has-text("NGリスト管理").active')).toBeVisible()
    await expect(page.locator('h3:has-text("動画ID")')).toBeVisible()
  })
})