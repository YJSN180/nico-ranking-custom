import { test, expect } from '@playwright/test'

test.describe('マイリスト機能', () => {
  test.beforeEach(async ({ page }) => {
    // IndexedDBをクリア
    await page.evaluateOnNewDocument(() => {
      indexedDB.deleteDatabase('NicoRankingDB')
    })
  })

  test('マイリストページが正しく表示される', async ({ page }) => {
    // マイリストページに移動
    await page.goto('http://localhost:3000/mylists')
    
    // ページの読み込みを待つ
    await page.waitForLoadState('domcontentloaded')
    
    // 読み込み中表示が消えるのを待つ（最大10秒）
    await page.waitForSelector('.loading', { state: 'hidden', timeout: 10000 }).catch(() => {})
    
    // タイトルを確認
    await expect(page).toHaveTitle(/マイリスト/)
    
    // ヘッダーが表示されているか確認
    const header = await page.getByRole('heading', { name: 'マイリスト' })
    await expect(header).toBeVisible()
    
    // デフォルトマイリストが存在するか確認
    const defaultMylist = await page.getByText('とりあえずマイリスト')
    await expect(defaultMylist).toBeVisible()
    
    // 新規作成ボタンが存在するか確認
    const createButton = await page.getByRole('button', { name: /新規作成/ })
    await expect(createButton).toBeVisible()
  })

  test('新しいマイリストを作成できる', async ({ page }) => {
    await page.goto('http://localhost:3000/mylists')
    
    // 読み込みを待つ
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000) // IndexedDBの初期化を待つ
    
    // 新規作成ボタンをクリック
    const createButton = await page.getByRole('button', { name: /新規作成/ })
    await createButton.click()
    
    // モーダルが表示されるのを待つ
    const modal = await page.getByText('新しいマイリストを作成')
    await expect(modal).toBeVisible()
    
    // フォームに入力
    await page.fill('input[type="text"]', 'テストマイリスト')
    await page.fill('textarea', 'これはテスト用のマイリストです')
    
    // 作成ボタンをクリック
    const submitButton = await page.getByRole('button', { name: '作成' })
    await submitButton.click()
    
    // モーダルが閉じるのを待つ
    await expect(modal).not.toBeVisible()
    
    // 新しいマイリストが表示されるのを確認
    const newMylist = await page.getByText('テストマイリスト')
    await expect(newMylist).toBeVisible()
  })

  test('マイリスト詳細ページに遷移できる', async ({ page }) => {
    await page.goto('http://localhost:3000/mylists')
    
    // 読み込みを待つ
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000) // IndexedDBの初期化を待つ
    
    // デフォルトマイリストをクリック
    const defaultMylist = await page.getByText('とりあえずマイリスト')
    await defaultMylist.click()
    
    // URLが変更されるのを待つ
    await page.waitForURL(/\/mylists\/.*/)
    
    // 詳細ページのタイトルを確認
    const title = await page.getByRole('heading', { name: 'とりあえずマイリスト' })
    await expect(title).toBeVisible()
    
    // 戻るボタンが表示されているか確認
    const backButton = await page.getByText('← マイリスト一覧')
    await expect(backButton).toBeVisible()
  })
})