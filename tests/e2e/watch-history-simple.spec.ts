import { test, expect } from '@playwright/test'

test.describe('視聴履歴基本動作テスト', () => {
  test('視聴履歴ページが正しく表示される', async ({ page }) => {
    // 1. 視聴履歴ページに直接アクセス
    await page.goto('/watch-history')
    await page.waitForLoadState('networkidle')

    // 2. ページタイトルを確認
    await expect(page.locator('h1.watch-history_title__QXPS5')).toContainText('視聴履歴')

    // 3. 空の状態メッセージを確認
    const emptyMessage = page.locator('text=まだ視聴履歴がありません')
    const isEmptyVisible = await emptyMessage.isVisible()
    
    console.log('空の状態メッセージが表示されているか:', isEmptyVisible)

    // 4. デバッグ：ページのHTMLを出力
    const bodyContent = await page.locator('body').innerHTML()
    console.log('ページの内容（一部）:', bodyContent.substring(0, 500))
  })

  test('IndexedDBに直接データを追加してリロード後に表示を確認', async ({ page }) => {
    // 1. 視聴履歴ページにアクセス
    await page.goto('/watch-history')
    await page.waitForLoadState('networkidle')

    // 2. IndexedDBに直接データを追加（ページ内で実行）
    const addResult = await page.evaluate(async () => {
      const dbName = 'nicoran-db'
      const storeName = 'watchHistory'
      
      return new Promise((resolve) => {
        const request = indexedDB.open(dbName, 4)
        
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction([storeName], 'readwrite')
          const store = transaction.objectStore(storeName)
          
          const testData = {
            videoId: 'sm99999',
            title: 'テスト動画タイトル',
            thumbURL: 'https://example.com/thumb.jpg',
            watchedAt: Date.now(),
            watchCount: 1,
            views: 1000,
            comments: 50,
            mylists: 10,
            likes: 100,
            authorName: 'テスト投稿者',
            authorId: 'user123'
          }
          
          const addRequest = store.put(testData)
          
          addRequest.onsuccess = () => {
            resolve({ success: true, data: testData })
          }
          
          addRequest.onerror = () => {
            resolve({ success: false, error: addRequest.error?.message })
          }
        }
        
        request.onerror = () => {
          resolve({ success: false, error: request.error?.message })
        }
      })
    })

    console.log('IndexedDB追加結果:', addResult)

    // 3. ページをリロード
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 4. タイトルが表示されているか確認
    const titleElement = page.locator('[data-testid="video-title"]')
    const titleVisible = await titleElement.isVisible()
    console.log('タイトルが表示されているか:', titleVisible)
    if (titleVisible) {
      const titleText = await titleElement.textContent()
      console.log('タイトルのテキスト:', titleText)
    }

    // 5. 視聴回数が表示されているか確認
    const watchCountElement = page.locator('span:has-text("視聴回数: 1回")')
    const watchCountVisible = await watchCountElement.isVisible()
    console.log('視聴回数が表示されているか:', watchCountVisible)

    // 6. デバッグ：コンソールログを取得
    page.on('console', msg => {
      console.log(`ブラウザコンソール [${msg.type()}]:`, msg.text())
    })

    // 7. 一度待機してコンソールログを確認
    await page.waitForTimeout(1000)

    // 8. アサーション
    if (!titleVisible) {
      const pageContent = await page.content()
      console.log('ページ全体のHTML:', pageContent)
    }

    expect(titleVisible).toBe(true)
    expect(watchCountVisible).toBe(true)
  })
})