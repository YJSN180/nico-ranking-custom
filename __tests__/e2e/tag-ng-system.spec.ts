import { test, expect } from '@playwright/test'

test.describe('Tag NG System E2E', () => {
  test.beforeEach(async ({ page }) => {
    // localStorageをクリア
    await page.addInitScript(() => {
      localStorage.clear()
    })
    
    // ホームページへ移動
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test('タグNGの追加と削除ができる', async ({ page }) => {
    // 設定モーダルを開く
    await page.click('button:has-text("設定")')
    
    // NGリストタブが選択されていることを確認
    await expect(page.locator('.tab.active')).toContainText('NGリスト')
    
    // タグセクションまでスクロール
    await page.locator('h3:has-text("🚫 タグ")').scrollIntoViewIfNeeded()
    
    // ロックタグ・完全一致を選択
    await page.check('input[type="radio"][value="locked"]')
    await page.check('input[type="radio"][value="exact"]')
    
    // タグを追加
    await page.fill('input[placeholder="タグ名を入力"]', 'ゲーム')
    await page.click('button:has-text("追加"):near(input[placeholder="タグ名を入力"])')
    
    // タグが追加されたことを確認
    await expect(page.locator('text=🔒 ゲーム (ロック・完全)')).toBeVisible()
    
    // ユーザータグ・部分一致を選択
    await page.check('input[type="radio"][value="user"]')
    await page.check('input[type="radio"][value="partial"]')
    
    // もう一つタグを追加
    await page.fill('input[placeholder="タグ名を入力"]', '歌ってみた')
    await page.click('button:has-text("追加"):near(input[placeholder="タグ名を入力"])')
    
    // タグが追加されたことを確認
    await expect(page.locator('text=🔖 歌ってみた (ユーザー・部分)')).toBeVisible()
    
    // 適用ボタンをクリック
    await page.click('button:has-text("適用")')
    
    // モーダルが閉じるのを待つ
    await expect(page.locator('.modal')).not.toBeVisible()
    
    // localStorageに保存されたことを確認
    const ngList = await page.evaluate(() => {
      const stored = localStorage.getItem('user-ng-list')
      return stored ? JSON.parse(stored) : null
    })
    
    expect(ngList).toBeTruthy()
    expect(ngList.version).toBe(2)
    expect(ngList.tags.locked.exact).toContain('ゲーム')
    expect(ngList.tags.user.partial).toContain('歌ってみた')
  })

  test('タグNGによるフィルタリングが動作する', async ({ page }) => {
    // モックデータをセットアップ
    await page.route('**/api/ranking*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              rank: 1,
              id: 'sm1',
              title: 'ゲーム実況動画',
              thumbURL: 'https://example.com/thumb1.jpg',
              views: 1000,
              comments: 100,
              mylists: 50,
              likes: 30,
              authorId: 'user1',
              authorName: 'ゲーム実況者',
              tagDetails: [
                { name: 'ゲーム', isLocked: true },
                { name: '実況プレイ', isLocked: false }
              ]
            },
            {
              rank: 2,
              id: 'sm2',
              title: '音楽動画',
              thumbURL: 'https://example.com/thumb2.jpg',
              views: 2000,
              comments: 200,
              mylists: 100,
              likes: 60,
              authorId: 'user2',
              authorName: '音楽制作者',
              tagDetails: [
                { name: '音楽', isLocked: true },
                { name: 'オリジナル曲', isLocked: false }
              ]
            },
            {
              rank: 3,
              id: 'sm3',
              title: 'カバー曲',
              thumbURL: 'https://example.com/thumb3.jpg',
              views: 1500,
              comments: 150,
              mylists: 75,
              likes: 45,
              authorId: 'user3',
              authorName: '歌い手',
              tagDetails: [
                { name: '歌ってみた', isLocked: false },
                { name: 'カバー', isLocked: false }
              ]
            }
          ],
          totalCount: 3
        })
      })
    })
    
    // NGリストを事前に設定
    await page.addInitScript(() => {
      const ngList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['ゲーム'], partial: [] },
          user: { exact: [], partial: ['歌ってみた'] },
          both: { exact: [], partial: [] }
        },
        version: 2,
        totalCount: 2,
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem('user-ng-list', JSON.stringify(ngList))
    })
    
    // ページをリロード
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    
    // ランキングが表示されるのを待つ
    await page.waitForSelector('.ranking-item', { timeout: 5000 })
    
    // フィルタリングされた結果を確認
    const visibleItems = await page.locator('.ranking-item').count()
    expect(visibleItems).toBe(1) // 音楽動画のみ表示される
    
    // 表示されている動画のタイトルを確認
    await expect(page.locator('.ranking-item').first()).toContainText('音楽動画')
    
    // NGされた動画が表示されていないことを確認
    await expect(page.locator('text="ゲーム実況動画"')).not.toBeVisible()
    await expect(page.locator('text="カバー曲"')).not.toBeVisible()
  })

  test('タグNGのバックアップとリストアができる', async ({ page }) => {
    // NGリストを設定
    await page.addInitScript(() => {
      const ngList = {
        videoIds: ['sm123'],
        videoTitles: { exact: ['NGタイトル'], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['東方'], partial: ['ゲーム'] },
          user: { exact: ['歌ってみた'], partial: [] },
          both: { exact: [], partial: ['MMD'] }
        },
        version: 2,
        totalCount: 5,
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem('user-ng-list', JSON.stringify(ngList))
    })
    
    await page.reload()
    
    // 設定モーダルを開く
    await page.click('button:has-text("設定")')
    
    // バックアップタブに切り替え
    await page.click('button:has-text("💾 バックアップ")')
    
    // エクスポートボタンをクリック
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("エクスポート")')
    
    // エクスポート確認ダイアログで統計を確認
    await expect(page.locator('text=タグ: 4件')).toBeVisible()
    await expect(page.locator('text=（ロック:2 / ユーザー:1 / 両方:1）')).toBeVisible()
    
    // ダウンロードを実行
    await page.click('button:has-text("ダウンロード")')
    const download = await downloadPromise
    
    // ダウンロードされたファイル名を確認
    expect(download.suggestedFilename()).toMatch(/nico-ranking-ng-list-backup-.*\.json/)
    
    // ダウンロードしたファイルの内容を確認
    const path = await download.path()
    const fs = require('fs')
    const content = JSON.parse(fs.readFileSync(path, 'utf8'))
    
    expect(content.version).toBe('1.1.0') // 拡張版のバージョン
    expect(content.ngList.tags).toBeTruthy()
    expect(content.ngList.tags.locked.exact).toContain('東方')
    expect(content.metadata.categoryBreakdown.tagsLockedExact).toBe(1)
    expect(content.metadata.categoryBreakdown.tagsLockedPartial).toBe(1)
    expect(content.metadata.categoryBreakdown.tagsUserExact).toBe(1)
    expect(content.metadata.categoryBreakdown.tagsBothPartial).toBe(1)
  })

  test('旧バージョンのNGリストをインポートできる', async ({ page }) => {
    // 設定モーダルを開く
    await page.click('button:has-text("設定")')
    
    // バックアップタブに切り替え
    await page.click('button:has-text("💾 バックアップ")')
    
    // 旧バージョンのバックアップファイルを作成
    const oldBackupData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      exportSource: 'settings-applied',
      ngList: {
        videoIds: ['sm999'],
        videoTitles: { exact: ['旧タイトル'], partial: [] },
        authorIds: ['olduser'],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 3,
        updatedAt: new Date().toISOString()
      },
      metadata: {
        totalItems: 3,
        categoryBreakdown: {
          videoIds: 1,
          videoTitlesExact: 1,
          videoTitlesPartial: 0,
          authorIds: 1,
          authorNamesExact: 0,
          authorNamesPartial: 0
        },
        appVersion: '0.9.0'
      }
    }
    
    // ファイル入力をシミュレート
    await page.setInputFiles('input[type="file"]', {
      name: 'old-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(oldBackupData))
    })
    
    // インポート成功メッセージを確認
    await expect(page.locator('text=✅ インポート完了')).toBeVisible()
    await expect(page.locator('text=追加されたアイテム: 3件')).toBeVisible()
    
    // localStorageに保存されたデータを確認
    const ngList = await page.evaluate(() => {
      const stored = localStorage.getItem('user-ng-list')
      return stored ? JSON.parse(stored) : null
    })
    
    expect(ngList.version).toBe(2) // マイグレーションされている
    expect(ngList.videoIds).toContain('sm999')
    expect(ngList.tags).toBeTruthy() // タグが追加されている
    expect(ngList.tags.locked.exact).toEqual([])
    expect(ngList.tags.user.exact).toEqual([])
    expect(ngList.tags.both.exact).toEqual([])
  })

  test('タグの種類と一致方法を切り替えられる', async ({ page }) => {
    // 設定モーダルを開く
    await page.click('button:has-text("設定")')
    
    // タグセクションまでスクロール
    await page.locator('h3:has-text("🚫 タグ")').scrollIntoViewIfNeeded()
    
    // デフォルトは「両方」「部分一致」
    await expect(page.locator('input[type="radio"][value="both"]:checked')).toBeVisible()
    await expect(page.locator('input[type="radio"][value="partial"]:checked')).toBeVisible()
    
    // タグを追加
    await page.fill('input[placeholder="タグ名を入力"]', 'テストタグ')
    await page.click('button:has-text("追加"):near(input[placeholder="タグ名を入力"])')
    
    // 両方・部分一致で追加されたことを確認
    await expect(page.locator('text=🏷️ テストタグ (両方・部分)')).toBeVisible()
    
    // ロックタグ・完全一致に切り替え
    await page.check('input[type="radio"][value="locked"]')
    await page.check('input[type="radio"][value="exact"]')
    
    // 別のタグを追加
    await page.fill('input[placeholder="タグ名を入力"]', 'ロックタグ')
    await page.click('button:has-text("追加"):near(input[placeholder="タグ名を入力"])')
    
    // ロック・完全一致で追加されたことを確認
    await expect(page.locator('text=🔒 ロックタグ (ロック・完全)')).toBeVisible()
    
    // ユーザータグ・完全一致に切り替え
    await page.check('input[type="radio"][value="user"]')
    
    // さらに別のタグを追加
    await page.fill('input[placeholder="タグ名を入力"]', 'ユーザータグ')
    await page.click('button:has-text("追加"):near(input[placeholder="タグ名を入力"])')
    
    // ユーザー・完全一致で追加されたことを確認
    await expect(page.locator('text=🔖 ユーザータグ (ユーザー・完全)')).toBeVisible()
    
    // タグを削除
    const deleteButtons = page.locator('button:has-text("×")')
    await deleteButtons.first().click()
    
    // タグが削除されたことを確認
    await expect(page.locator('text=🏷️ テストタグ (両方・部分)')).not.toBeVisible()
  })
})