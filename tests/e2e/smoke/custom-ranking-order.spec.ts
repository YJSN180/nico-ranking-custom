import { test, expect } from '@playwright/test'

test.describe('カスタムランキング並び替え・表示/非表示機能', () => {
  test.beforeEach(async ({ page }) => {
    // カスタムランキングデータを準備
    await page.goto('/')
    
    await page.evaluate(() => {
      const customRankings = {
        rankings: [
          {
            id: 'game-ranking-1',
            title: 'ゲーム実況ランキング',
            baseGenre: 'game',
            conditions: [
              { tag: '実況プレイ', operator: 'AND', tagType: 'both' }
            ],
            createdAt: Date.now() - 3600000,
            updatedAt: Date.now() - 3600000
          },
          {
            id: 'music-ranking-1',
            title: 'VOCALOID新曲',
            baseGenre: 'music',
            conditions: [
              { tag: 'VOCALOID', operator: 'AND', tagType: 'both' }
            ],
            createdAt: Date.now() - 7200000,
            updatedAt: Date.now() - 7200000
          },
          {
            id: 'tech-ranking-1',
            title: 'プログラミング講座',
            baseGenre: 'tech',
            conditions: [
              { tag: 'プログラミング', operator: 'AND', tagType: 'both' }
            ],
            createdAt: Date.now() - 10800000,
            updatedAt: Date.now() - 10800000
          }
        ],
        selectedId: undefined
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRankings))
      
      // 初期の順序データ（すべて表示）
      const orderData = [
        { id: 'game-ranking-1', order: 0, isVisible: true },
        { id: 'music-ranking-1', order: 1, isVisible: true },
        { id: 'tech-ranking-1', order: 2, isVisible: true }
      ]
      localStorage.setItem('customRankingsOrder', JSON.stringify(orderData))
    })
  })

  test('カスタムランキングの並び替えボタンが表示される', async ({ page }) => {
    await page.goto('/?genre=custom')
    
    // カスタムランキングセクションが表示される
    await expect(page.locator('h2:has-text("カスタムランキング")')).toBeVisible()
    
    // 並び替えボタンが表示される
    const reorderButton = page.locator('button:has-text("並び替え")')
    await expect(reorderButton).toBeVisible()
  })

  test('並び替えモードでドラッグ&ドロップで順序を変更できる', async ({ page }) => {
    await page.goto('/?genre=custom')
    
    // 並び替えボタンをクリック
    await page.locator('button:has-text("並び替え")').click()
    
    // 並び替えモードのタイトルが表示される
    await expect(page.locator('h3:has-text("カスタムランキングの並び替え")')).toBeVisible()
    
    // ドラッグハンドルが表示される
    const dragHandles = page.locator('button[aria-label="ドラッグして順序を変更"]')
    await expect(dragHandles).toHaveCount(3)
    
    // 最初のアイテムの位置を記録
    const firstItem = page.locator('text=ゲーム実況ランキング')
    const secondItem = page.locator('text=VOCALOID新曲')
    
    // ドラッグ&ドロップで順序を変更（1番目を2番目の位置へ）
    const firstHandle = dragHandles.first()
    const secondHandle = dragHandles.nth(1)
    
    await firstHandle.dragTo(secondHandle)
    
    // 順序が変更されたことを確認
    const items = page.locator('.customRankingItem')
    await expect(items.nth(0)).toContainText('VOCALOID新曲')
    await expect(items.nth(1)).toContainText('ゲーム実況ランキング')
    
    // 完了ボタンをクリック
    await page.locator('button:has-text("完了")').click()
    
    // 並び替えモードが終了したことを確認
    await expect(page.locator('h3:has-text("カスタムランキングの並び替え")')).not.toBeVisible()
  })

  test('表示/非表示ボタンで表示を切り替えられる', async ({ page }) => {
    await page.goto('/?genre=custom')
    
    // 並び替えボタンをクリックして編集モードに入る
    await page.locator('button:has-text("並び替え")').click()
    
    // 表示/非表示ボタンが表示される
    const visibilityButtons = page.locator('button[title*="表示"]')
    await expect(visibilityButtons).toHaveCount(3)
    
    // 最初のアイテムの表示/非表示ボタンをクリック
    await visibilityButtons.first().click()
    
    // ボタンのタイトルが「表示する」に変わることを確認
    await expect(visibilityButtons.first()).toHaveAttribute('title', '表示する')
    
    // 完了ボタンをクリック
    await page.locator('button:has-text("完了")').click()
    
    // タグセレクター内のカスタムランキングが2つになることを確認
    // （表示されているもののみ）
    const customRankingButtons = page.locator('.tagScrollContainer button').filter({ hasText: /ランキング|新曲|講座/ })
    await expect(customRankingButtons).toHaveCount(2)
    
    // 非表示にしたランキングが表示されないことを確認
    await expect(page.locator('button:has-text("ゲーム実況ランキング")')).not.toBeVisible()
  })

  test('localStorageに順序と表示状態が保存される', async ({ page }) => {
    await page.goto('/?genre=custom')
    
    // 並び替えモードに入る
    await page.locator('button:has-text("並び替え")').click()
    
    // 最初のアイテムを非表示にする
    const visibilityButtons = page.locator('button[title*="表示"]')
    await visibilityButtons.first().click()
    
    // ドラッグ&ドロップで順序を変更
    const dragHandles = page.locator('button[aria-label="ドラッグして順序を変更"]')
    await dragHandles.nth(1).dragTo(dragHandles.nth(2))
    
    // 完了ボタンをクリック
    await page.locator('button:has-text("完了")').click()
    
    // localStorageの内容を確認
    const orderData = await page.evaluate(() => {
      const stored = localStorage.getItem('customRankingsOrder')
      return stored ? JSON.parse(stored) : null
    })
    
    expect(orderData).toBeTruthy()
    expect(orderData).toHaveLength(3)
    
    // 最初のアイテムが非表示になっていることを確認
    const firstItem = orderData.find((item: any) => item.id === 'game-ranking-1')
    expect(firstItem.isVisible).toBe(false)
    
    // 順序が変更されていることを確認
    const sortedItems = orderData.sort((a: any, b: any) => a.order - b.order)
    expect(sortedItems[0].id).toBe('game-ranking-1')
    expect(sortedItems[1].id).toBe('tech-ranking-1')
    expect(sortedItems[2].id).toBe('music-ranking-1')
  })

  test('ページリロード後も順序と表示状態が維持される', async ({ page }) => {
    await page.goto('/?genre=custom')
    
    // 並び替えと表示/非表示の変更を行う
    await page.locator('button:has-text("並び替え")').click()
    
    // 最初のアイテムを非表示
    const visibilityButtons = page.locator('button[title*="表示"]')
    await visibilityButtons.first().click()
    
    // 順序を変更
    const dragHandles = page.locator('button[aria-label="ドラッグして順序を変更"]')
    await dragHandles.nth(1).dragTo(dragHandles.nth(2))
    
    await page.locator('button:has-text("完了")').click()
    
    // ページをリロード
    await page.reload()
    await page.goto('/?genre=custom')
    
    // カスタムランキングが2つ表示されることを確認
    const customRankingButtons = page.locator('.tagScrollContainer button').filter({ hasText: /ランキング|新曲|講座/ })
    await expect(customRankingButtons).toHaveCount(2)
    
    // 順序が維持されていることを確認
    await expect(customRankingButtons.nth(0)).toContainText('プログラミング講座')
    await expect(customRankingButtons.nth(1)).toContainText('VOCALOID新曲')
  })
})