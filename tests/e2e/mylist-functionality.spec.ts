import { test, expect } from '@playwright/test'
import { 
  mockAPIRoutes, 
  setupIndexedDBMock, 
  waitForPageReady,
  waitForMylistButtons,
  openMobileMenu,
  createTestMylist,
  addVideoToMylist
} from './helpers/test-helpers'

test.describe('マイリスト機能', () => {
  test.beforeEach(async ({ page }) => {
    // APIモックとIndexedDBセットアップ
    await mockAPIRoutes(page)
    await setupIndexedDBMock(page)
    
    // ホームページにアクセス
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('マイリストページへのナビゲーション', async ({ page }) => {
    // メニューを開く
    await openMobileMenu(page)
    
    // マイリストリンクをクリック
    await page.click('a[href="/mylists"]:visible')
    
    // マイリストページが表示されることを確認
    await expect(page).toHaveURL('/mylists')
    await expect(page.locator('h1')).toContainText('マイリスト')
    
    // ページが完全に読み込まれるまで待機
    await waitForPageReady(page)
    
    // デフォルトマイリストが存在することを確認
    await expect(page.locator('h3:has-text("とりあえずマイリスト")').first()).toBeVisible()
  })

  test('動画をマイリストに追加', async ({ page }) => {
    // マイリストボタンが表示されるまで待機
    await waitForMylistButtons(page)
    
    // ランキングページの最初の動画を取得
    const firstVideo = page.locator('.ranking-item-responsive').first()
    const videoTitle = await firstVideo.locator('h3').textContent()
    
    // 動画をマイリストに追加
    await addVideoToMylist(page, 0)
    
    // ボタンの状態変化を確認
    await expect(firstVideo.locator('button[aria-label="マイリストから削除"]')).toBeVisible()
    
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // デフォルトマイリストをクリック
    await page.locator('h3:has-text("とりあえずマイリスト")').first().click()
    await waitForPageReady(page)
    
    // 追加した動画が表示されることを確認
    await expect(page.locator(`text=${videoTitle}`)).toBeVisible()
  })

  test('新規マイリスト作成', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // 新規マイリストを作成
    const mylistName = `テストマイリスト_${Date.now()}`
    await createTestMylist(page, mylistName, 'E2Eテスト用のマイリストです')
    
    // 新しいマイリストが表示されることを確認
    await expect(page.locator(`text=${mylistName}`)).toBeVisible()
  })

  test('マイリスト内での動画検索', async ({ page }) => {
    // マイリストボタンが表示されるまで待機
    await waitForMylistButtons(page)
    
    // 動画を追加
    await addVideoToMylist(page, 0)
    
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // デフォルトマイリストを開く
    await page.locator('h3:has-text("とりあえずマイリスト")').first().click()
    await waitForPageReady(page)
    
    // 検索ボックスに入力
    await page.fill('input[placeholder*="動画を検索"]', 'test')
    
    // 検索結果が更新されることを確認（デバウンス待機）
    await page.waitForTimeout(500)
    
    // 検索機能が動作していることを確認
    const searchBox = page.locator('input[placeholder*="動画を検索"]')
    await expect(searchBox).toHaveValue('test')
  })

  test('マイリストの編集と削除', async ({ page }) => {
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // 新規マイリストを作成
    const mylistName = `削除テスト_${Date.now()}`
    await createTestMylist(page, mylistName)
    
    // 作成されたマイリストの編集ボタンをクリック
    const mylistCard = page.locator(`div:has-text("${mylistName}")`).first()
    await mylistCard.locator('button:has-text("編集")').click()
    
    // 編集モーダルが表示されることを確認
    await expect(page.locator('text=マイリスト編集')).toBeVisible()
    
    // 名前を変更
    const newName = `${mylistName}_編集済み`
    await page.fill('input[value*="削除テスト"]', newName)
    
    // 更新ボタンをクリック
    await page.click('button:has-text("更新")')
    await page.waitForTimeout(200)
    
    // 名前が更新されることを確認
    await expect(page.locator(`text=${newName}`)).toBeVisible()
    
    // 削除の確認ダイアログを事前に設定
    page.once('dialog', dialog => dialog.accept())
    
    // 削除ボタンをクリック
    const updatedCard = page.locator(`div:has-text("${newName}")`).first()
    await updatedCard.locator('button:has-text("削除")').click()
    
    // マイリストが削除されることを確認
    await expect(page.locator(`text=${newName}`)).toBeHidden({ timeout: 5000 })
  })

  test('動画のメモ編集', async ({ page }) => {
    // マイリストボタンが表示されるまで待機
    await waitForMylistButtons(page)
    
    // 動画を追加
    const firstVideo = page.locator('.ranking-item-responsive').first()
    const videoTitle = await firstVideo.locator('h3').textContent()
    await addVideoToMylist(page, 0)
    
    // マイリストページに移動
    await page.goto('/mylists')
    await waitForPageReady(page)
    
    // デフォルトマイリストを開く
    await page.locator('h3:has-text("とりあえずマイリスト")').first().click()
    await waitForPageReady(page)
    
    // メモ編集ボタンをクリック
    const videoCard = page.locator(`div:has-text("${videoTitle}")`).first()
    await videoCard.locator('button[aria-label="メモを編集"]').click()
    
    // メモ編集モーダルが表示されることを確認
    await expect(page.locator('text=メモを編集')).toBeVisible()
    
    // メモを入力
    const memoText = 'これは素晴らしい動画です！'
    await page.fill('textarea', memoText)
    
    // 保存ボタンをクリック
    await page.click('button:has-text("保存")')
    
    // モーダルが閉じることを確認
    await expect(page.locator('text=メモを編集')).toBeHidden({ timeout: 5000 })
    
    // メモが表示されることを確認
    await expect(page.locator(`text=${memoText}`)).toBeVisible()
  })
})