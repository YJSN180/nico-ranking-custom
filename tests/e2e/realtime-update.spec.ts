import { test, expect } from '@playwright/test'

test.describe('リアルタイム更新機能', () => {
  test('動画の統計情報がリアルタイムで更新される', async ({ page }) => {
    // APIレスポンスをモック
    await page.route('**/api/ranking?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              rank: 1,
              id: 'sm12345',
              title: 'テスト動画1',
              thumbURL: 'https://example.com/thumb1.jpg',
              views: 1000,
              comments: 50,
              mylists: 10,
              likes: 100,
              authorName: 'テスト投稿者',
              registeredAt: new Date().toISOString()
            },
            {
              rank: 2,
              id: 'sm67890',
              title: 'テスト動画2',
              thumbURL: 'https://example.com/thumb2.jpg',
              views: 2000,
              comments: 100,
              mylists: 20,
              likes: 200,
              authorName: 'テスト投稿者2',
              registeredAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() // 5時間前
            }
          ],
          popularTags: ['タグ1', 'タグ2']
        })
      })
    })

    // 初回の統計情報APIレスポンスをモック
    await page.route('**/api/video-stats?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stats: {
            sm12345: { viewCounter: 1500, commentCounter: 75, mylistCounter: 15, likeCounter: 150 },
            sm67890: { viewCounter: 2500, commentCounter: 125, mylistCounter: 25, likeCounter: 250 }
          },
          timestamp: new Date().toISOString(),
          count: 2
        })
      })
    })

    // ページを開く
    await page.goto('/')

    // 初期データが表示されることを確認
    await expect(page.locator('text=テスト動画1')).toBeVisible()
    await expect(page.locator('text=1,000 回再生')).toBeVisible()

    // リアルタイム更新を待つ（APIが呼ばれて更新される）
    await page.waitForTimeout(1000)

    // 更新された統計情報が表示されることを確認
    await expect(page.locator('text=1,500 回再生')).toBeVisible()
    await expect(page.locator('text=75').first()).toBeVisible() // コメント数
    await expect(page.locator('text=15').first()).toBeVisible() // マイリスト数
    await expect(page.locator('text=150').first()).toBeVisible() // いいね数

    // 最終更新時刻が表示されることを確認
    await expect(page.locator('text=最終更新:')).toBeVisible()
  })

  test('更新中インジケーターが表示される', async ({ page }) => {
    // 遅いAPIレスポンスをモック
    await page.route('**/api/ranking?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            rank: 1,
            id: 'sm12345',
            title: 'テスト動画',
            thumbURL: '',
            views: 1000
          }],
          popularTags: []
        })
      })
    })

    await page.route('**/api/video-stats?**', async route => {
      // 遅延を追加
      await new Promise(resolve => setTimeout(resolve, 500))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stats: {},
          timestamp: new Date().toISOString(),
          count: 0
        })
      })
    })

    await page.goto('/')

    // 更新中インジケーターが表示されることを確認
    await expect(page.locator('text=統計情報を更新中...')).toBeVisible()
    
    // 更新完了後にインジケーターが消えることを確認
    await expect(page.locator('text=統計情報を更新中...')).not.toBeVisible({ timeout: 2000 })
  })

  test('投稿日時の表示が正しい', async ({ page }) => {
    const now = new Date()
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    await page.route('**/api/ranking?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              rank: 1,
              id: 'sm1',
              title: '20時間前の動画',
              thumbURL: '',
              views: 1000,
              registeredAt: twentyHoursAgo.toISOString(),
              authorName: '投稿者1'
            },
            {
              rank: 2,
              id: 'sm2',
              title: '3日前の動画',
              thumbURL: '',
              views: 2000,
              registeredAt: threeDaysAgo.toISOString(),
              authorName: '投稿者2'
            }
          ],
          popularTags: []
        })
      })
    })

    await page.goto('/')

    // 24時間以内の動画は赤字で「○時間前」表示
    const newVideoDate = page.locator('text=20時間前')
    await expect(newVideoDate).toBeVisible()
    await expect(newVideoDate).toHaveCSS('color', 'rgb(231, 76, 60)') // #e74c3c

    // 24時間以上前の動画は通常色で日付表示
    const oldVideoDate = page.locator('text=/202\\d-\\d{2}-\\d{2}/')
    await expect(oldVideoDate).toBeVisible()
    await expect(oldVideoDate).toHaveCSS('color', 'rgb(153, 153, 153)') // #999
  })
})