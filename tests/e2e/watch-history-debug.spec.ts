import { test, expect } from '@playwright/test'

test.describe('視聴履歴デバッグテスト', () => {
  test('視聴履歴が空の状態を確認', async ({ page }) => {
    // IndexedDBをクリア
    await page.goto('/')
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const deleteReq = indexedDB.deleteDatabase('nicoran-db')
        deleteReq.onsuccess = () => resolve(undefined)
        deleteReq.onerror = () => resolve(undefined)
        deleteReq.onblocked = () => resolve(undefined)
      })
    })

    // 視聴履歴ページに移動
    await page.goto('/watch-history')
    await page.waitForLoadState('networkidle')

    // 空の状態を確認
    await expect(page.locator('text=まだ視聴履歴がありません')).toBeVisible()
  })

  test('IndexedDBに直接データを追加して表示を確認', async ({ page }) => {
    // まずトップページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // IndexedDBに直接データを追加
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('nicoran-db', 4)
        
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction(['watchHistory'], 'readwrite')
          const store = transaction.objectStore('watchHistory')
          
          const data = {
            videoId: 'sm12345',
            title: 'テスト動画',
            thumbURL: 'https://example.com/thumb.jpg',
            watchedAt: Date.now(),
            watchCount: 1,
            views: 1000,
            comments: 50,
            mylists: 10,
            likes: 100
          }
          
          const addRequest = store.put(data)
          addRequest.onsuccess = () => resolve(undefined)
          addRequest.onerror = () => reject(addRequest.error)
        }
        
        request.onerror = () => reject(request.error)
      })
    })

    // 視聴履歴ページに移動
    await page.goto('/watch-history')
    await page.waitForLoadState('networkidle')

    // データが表示されることを確認
    const titleVisible = await page.locator('text=テスト動画').isVisible()
    const watchCountVisible = await page.locator('text=視聴回数: 1回').isVisible()
    
    console.log('タイトル表示:', titleVisible)
    console.log('視聴回数表示:', watchCountVisible)
    
    // デバッグ: ページのHTMLを出力
    const pageContent = await page.content()
    if (!titleVisible || !watchCountVisible) {
      console.log('ページHTML（一部）:', pageContent.substring(0, 1000))
    }

    await expect(page.locator('text=テスト動画')).toBeVisible()
    await expect(page.locator('text=視聴回数: 1回')).toBeVisible()
  })
})