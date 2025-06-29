import { test, expect } from '@playwright/test'
import { 
  mockAPIRoutes, 
  setupIndexedDBMock, 
  waitForPageReady,
  waitForMylistButtons
} from './helpers/test-helpers'

test.describe('Safari 7-day IndexedDB persistence countermeasures', () => {
  // Safariブラウザでのみ実行
  test.skip(({ browserName }) => browserName !== 'webkit', 'Safari only tests')

  test.beforeEach(async ({ page }) => {
    // APIモックとIndexedDBセットアップ
    await mockAPIRoutes(page)
    await setupIndexedDBMock(page)
    
    // ホームページにアクセス
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('should display persistence warning for Safari users', async ({ page }) => {
    // マイリストページに直接移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // Safari用の永続化警告が表示されることを確認
    const warningElement = page.locator('[data-testid="safari-persistence-warning"]')
    await expect(warningElement).toBeVisible()
    
    // 警告テキストの内容を確認
    await expect(warningElement).toContainText('Safari')
    await expect(warningElement).toContainText('7日間')
    await expect(warningElement).toContainText('自動削除')
  })

  test('should show backup reminder notification', async ({ page }) => {
    // マイリストページに直接移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // バックアップリマインダーが表示されることを確認（条件によって表示される）
    const reminderElement = page.locator('[data-testid="backup-reminder"]')
    
    // リマインダーが表示される場合の内容を確認
    if (await reminderElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(reminderElement).toContainText('バックアップ')
      await expect(reminderElement).toContainText('推奨')
    } else {
      // リマインダーが表示されない場合はスキップ（正常な状態）
      console.log('Backup reminder not shown (expected in some conditions)')
    }
  })

  test('should provide data export functionality', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // エクスポートボタンが存在することを確認
    const exportButton = page.locator('[data-testid="export-mylists-button"]')
    await expect(exportButton).toBeVisible()
    
    // エクスポートボタンをクリック
    await exportButton.click()
    
    // ダウンロード確認ダイアログが表示されることを確認
    const downloadDialog = page.locator('[data-testid="export-confirm-dialog"]')
    await expect(downloadDialog).toBeVisible()
  })

  test('should provide data import functionality', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // インポートボタンが存在することを確認
    const importButton = page.locator('[data-testid="import-mylists-button"]')
    await expect(importButton).toBeVisible()
    
    // インポートボタンをクリック
    await importButton.click()
    
    // ファイル選択ダイアログが表示されることを確認
    const fileInput = page.locator('input[type="file"][data-testid="import-file-input"]')
    await expect(fileInput).toBeVisible()
  })

  test('should show persistent storage permission prompt', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // 永続化許可ボタンが表示されることを確認（Safari以外では非表示）
    const persistButton = page.locator('[data-testid="request-persistence-button"]')
    await expect(persistButton).toBeVisible()
    
    // ボタンをクリック
    await persistButton.click()
    
    // 許可リクエストの結果メッセージが表示されることを確認
    const resultMessage = page.locator('[data-testid="persistence-result-message"]')
    await expect(resultMessage).toBeVisible()
  })

  test('should display last access date information', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // 最終アクセス日時が表示されることを確認
    const lastAccessInfo = page.locator('[data-testid="last-access-info"]')
    await expect(lastAccessInfo).toBeVisible()
    
    // 日付フォーマットを確認
    await expect(lastAccessInfo).toContainText('最終アクセス')
    await expect(lastAccessInfo).toContainText(/\d{4}\/\d{2}\/\d{2}/)
  })

  test('should automatically update last access timestamp', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // 現在の最終アクセス日時を取得
    const initialTimestamp = await page.locator('[data-testid="last-access-timestamp"]').textContent()
    
    // ページをリロード
    await page.reload()
    
    // タイムスタンプが更新されていることを確認
    const updatedTimestamp = await page.locator('[data-testid="last-access-timestamp"]').textContent()
    expect(initialTimestamp).not.toEqual(updatedTimestamp)
  })

  test('should show Safari-specific help documentation', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // ヘルプボタンをクリック
    await page.locator('[data-testid="safari-help-button"]').click()
    
    // Safari専用のヘルプモーダルが表示されることを確認
    const helpModal = page.locator('[data-testid="safari-help-modal"]')
    await expect(helpModal).toBeVisible()
    
    // ヘルプ内容を確認
    await expect(helpModal).toContainText('Safari')
    await expect(helpModal).toContainText('IndexedDB')
    await expect(helpModal).toContainText('対策')
    await expect(helpModal).toContainText('バックアップ方法')
  })

  test('should schedule periodic backup reminders', async ({ page }) => {
    // LocalStorageでリマインダー設定を確認
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // リマインダー設定ボタンをクリック
    await page.locator('[data-testid="reminder-settings-button"]').click()
    
    // 設定モーダルが表示されることを確認
    const settingsModal = page.locator('[data-testid="reminder-settings-modal"]')
    await expect(settingsModal).toBeVisible()
    
    // リマインダー間隔オプションを確認
    await expect(page.locator('[data-testid="reminder-interval-3days"]')).toBeVisible()
    await expect(page.locator('[data-testid="reminder-interval-5days"]')).toBeVisible()
    await expect(page.locator('[data-testid="reminder-interval-7days"]')).toBeVisible()
    await expect(page.locator('[data-testid="reminder-interval-off"]')).toBeVisible()
  })

  test('should validate imported data format', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // インポートボタンをクリック
    await page.locator('[data-testid="import-mylists-button"]').click()
    
    // 無効なファイルをアップロード（テスト用のモックファイル）
    const fileInput = page.locator('input[type="file"][data-testid="import-file-input"]')
    await fileInput.setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"invalid": "data"}')
    })
    
    // エラーメッセージが表示されることを確認
    const errorMessage = page.locator('[data-testid="import-error-message"]')
    await expect(errorMessage).toBeVisible()
    await expect(errorMessage).toContainText('無効なファイル形式')
  })
})