import { test, expect } from '@playwright/test'

test.describe('最新コメント表示機能', () => {
  test('ランキングに最新コメントが表示される', async ({ page }) => {
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
              views: 10000,
              comments: 500,
              mylists: 100,
              likes: 1000,
              authorName: 'テスト投稿者',
              registeredAt: new Date().toISOString(),
              latestComments: ['すごい！', 'かわいい', '88888', '神回だった', '泣いた']
            },
            {
              rank: 2,
              id: 'sm67890',
              title: 'テスト動画2',
              thumbURL: 'https://example.com/thumb2.jpg',
              views: 5000,
              comments: 200,
              mylists: 50,
              likes: 500,
              authorName: 'テスト投稿者2',
              registeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              latestComments: ['これは本当に長いコメントで、表示領域を超えるような内容になっています', 'もう一つ', 'コメント3']
            },
            {
              rank: 3,
              id: 'sm11111',
              title: 'コメントなし動画',
              thumbURL: 'https://example.com/thumb3.jpg',
              views: 1000,
              authorName: 'テスト投稿者3',
              registeredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
              // latestCommentsなし
            }
          ],
          popularTags: []
        })
      })
    })

    // ページを開く
    await page.goto('/')

    // 最新コメントが表示されることを確認
    await expect(page.locator('text=すごい！')).toBeVisible()
    await expect(page.locator('text=かわいい')).toBeVisible()
    await expect(page.locator('text=88888')).toBeVisible()
    
    // コメントが | で区切られていることを確認
    const commentContainer = page.locator('text=すごい！').locator('xpath=..')
    await expect(commentContainer).toContainText('|')
    
    // 長いコメントが省略されることを確認
    await expect(page.locator('text=/これは本当に長い/')).toBeVisible()
    await expect(page.locator('text=...')).toBeVisible()
    
    // コメントの背景色が薄いグレーであることを確認
    const commentBox = page.locator('div:has-text("すごい！")').first()
    await expect(commentBox).toHaveCSS('background-color', 'rgb(245, 245, 245)') // #f5f5f5
    
    // コメントアイコンが表示されることを確認
    await expect(page.locator('text=💬').first()).toBeVisible()
    
    // コメントがない動画にはコメント欄が表示されないことを確認
    const video3 = page.locator('text=コメントなし動画')
    await expect(video3).toBeVisible()
    const video3Container = video3.locator('xpath=ancestor::li')
    await expect(video3Container.locator('text=💬')).not.toBeVisible()
  })

  test('ランキング順位の文字サイズが大きくなっている', async ({ page }) => {
    await page.route('**/api/ranking?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              rank: 1,
              id: 'sm1',
              title: '1位の動画',
              thumbURL: '',
              views: 1000
            },
            {
              rank: 4,
              id: 'sm4',
              title: '4位の動画',
              thumbURL: '',
              views: 400
            }
          ],
          popularTags: []
        })
      })
    })

    await page.goto('/')

    // 1-3位のフォントサイズが32pxであることを確認
    const rank1 = page.locator('text=1').first()
    await expect(rank1).toHaveCSS('font-size', '32px')
    
    // 4位以降のフォントサイズが24pxであることを確認
    const rank4 = page.locator('text=4').first()
    await expect(rank4).toHaveCSS('font-size', '24px')
  })

  test('タグが表示されないことを確認', async ({ page }) => {
    await page.route('**/api/ranking?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              rank: 1,
              id: 'sm12345',
              title: 'タグ付き動画',
              thumbURL: '',
              views: 1000,
              tags: ['タグ1', 'タグ2', 'タグ3'] // タグは含まれているが表示されない
            }
          ],
          popularTags: []
        })
      })
    })

    await page.goto('/')

    // タグが表示されないことを確認
    await expect(page.locator('text=タグ1')).not.toBeVisible()
    await expect(page.locator('text=タグ2')).not.toBeVisible()
    await expect(page.locator('text=タグ3')).not.toBeVisible()
  })
})