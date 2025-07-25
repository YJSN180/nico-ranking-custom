import { test, expect } from '@playwright/test'
import { waitForPageReady } from './helpers/test-helpers'

test.describe('カスタムランキング インライン表示機能', () => {
  test.beforeEach(async ({ page }) => {
    // localStorageにカスタムランキングを設定
    await page.goto('/')
    await page.evaluate(() => {
      const customRankings = {
        rankings: [
          {
            id: 'game-custom-1',
            title: 'ゲーム実況限定',
            baseGenre: 'game',
            conditions: [
              { tag: '実況プレイ動画', operator: 'AND', tagType: 'both' }
            ]
          },
          {
            id: 'music-custom-1',
            title: '音楽（演奏除く）',
            baseGenre: 'music',
            conditions: [
              { tag: '演奏してみた', operator: 'NOT', tagType: 'both' }
            ]
          }
        ],
        selectedId: undefined
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRankings))
    })
  })

  test('カスタムランキングを選択してもページ遷移せず、同じページで内容を表示する', async ({ page }) => {
    // カスタムジャンルを選択
    await page.goto('/?genre=custom')
    await waitForPageReady(page)

    // カスタムランキングが表示されることを確認
    await expect(page.locator('h2:has-text("カスタムランキング")')).toBeVisible()

    // カスタムランキングのボタンが表示されることを確認
    const gameCustomButton = page.locator('button:has-text("ゲーム実況限定")')
    await expect(gameCustomButton).toBeVisible()

    // 現在のURLを記録
    const urlBeforeClick = page.url()

    // カスタムランキングをクリック
    await gameCustomButton.click()
    await page.waitForTimeout(1000)

    // URLがgenre=customのままで、tagパラメータが追加されることを確認
    const urlAfterClick = page.url()
    expect(urlAfterClick).toContain('genre=custom')
    expect(urlAfterClick).toContain('tag=custom%3Agame-custom-1')
    
    // ページ遷移していないことを確認（URLのベースパスが同じ）
    const urlBeforeBase = new URL(urlBeforeClick).pathname
    const urlAfterBase = new URL(urlAfterClick).pathname
    expect(urlBeforeBase).toBe(urlAfterBase)

    // ランキングデータが表示されることを確認
    await expect(page.locator('.ranking-item').first()).toBeVisible()
  })

  test('選択したカスタムランキングの名前がジャンルセレクターに表示される', async ({ page }) => {
    // カスタムジャンルを選択
    await page.goto('/?genre=custom')
    await waitForPageReady(page)

    // カスタムランキングを選択
    const gameCustomButton = page.locator('button:has-text("ゲーム実況限定")')
    await gameCustomButton.click()
    await page.waitForTimeout(1000)

    // ジャンルセレクターのカスタムボタンにカスタムランキング名が表示されることを確認
    const customGenreButton = page.locator('.genreButtonSelected:has-text("ゲーム実況限定")')
    await expect(customGenreButton).toBeVisible()
  })

  test('カスタムランキング選択時にbaseGenreのデータが表示される', async ({ page }) => {
    // ゲームジャンルのデータを確認
    await page.goto('/?genre=game')
    await waitForPageReady(page)
    
    // 最初の動画のタイトルを記録
    const gameFirstVideoTitle = await page.locator('.ranking-item').first().locator('h3').textContent()

    // カスタムジャンルに切り替え
    await page.goto('/?genre=custom&tag=custom%3Agame-custom-1')
    await waitForPageReady(page)

    // 同じbaseGenre（game）のデータが表示されることを確認
    // カスタムランキングはフィルタリングを追加するだけなので、
    // 元のゲームランキングの一部が表示されるはず
    const customFirstVideoTitle = await page.locator('.ranking-item').first().locator('h3').textContent()
    
    // データが表示されていることを確認（空でない）
    expect(customFirstVideoTitle).toBeTruthy()
    
    // ランキングアイテムが複数表示されることを確認
    const rankingItems = page.locator('.ranking-item')
    await expect(rankingItems).toHaveCount(100) // 1ページ100件
  })

  test('カスタムランキングのタグ条件が表示される', async ({ page }) => {
    // カスタムジャンルを選択
    await page.goto('/?genre=custom&tag=custom%3Amusic-custom-1')
    await waitForPageReady(page)

    // 除外タグセクションが表示されることを確認
    await expect(page.locator('h2:has-text("除外タグ")')).toBeVisible()
    
    // 除外タグが表示されることを確認
    const excludeTagButton = page.locator('button:has-text("演奏してみた")').filter({ hasText: /^演奏してみた/ })
    await expect(excludeTagButton).toBeVisible()
    
    // 除外タグのスタイルが適用されていることを確認（line-through）
    const excludeTagStyle = await excludeTagButton.evaluate(el => window.getComputedStyle(el).textDecoration)
    expect(excludeTagStyle).toContain('line-through')
  })

  test('別のカスタムランキングに切り替えると内容が更新される', async ({ page }) => {
    // 最初のカスタムランキングを選択
    await page.goto('/?genre=custom')
    await waitForPageReady(page)
    
    const gameCustomButton = page.locator('button:has-text("ゲーム実況限定")')
    await gameCustomButton.click()
    await page.waitForTimeout(1000)

    // ゲーム実況限定が選択されていることを確認
    await expect(page.locator('.genreButtonSelected:has-text("ゲーム実況限定")')).toBeVisible()

    // 別のカスタムランキングに切り替え
    const musicCustomButton = page.locator('button:has-text("音楽（演奏除く）")')
    await musicCustomButton.click()
    await page.waitForTimeout(1000)

    // 音楽（演奏除く）が選択されていることを確認
    await expect(page.locator('.genreButtonSelected:has-text("音楽（演奏除く）")')).toBeVisible()
    
    // URLが更新されていることを確認
    expect(page.url()).toContain('tag=custom%3Amusic-custom-1')
  })
})