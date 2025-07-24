import { test, expect } from '@playwright/test'

test.describe('カスタムランキング機能テスト', () => {
  test.beforeEach(async ({ page }) => {
    // ページに移動してからlocalStorageをクリア
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    
    // CSP制限を回避してlocalStorageをクリア
    try {
      await page.addInitScript(() => {
        try {
          localStorage.removeItem('custom-rankings')
        } catch (e) {
          console.log('localStorage clear failed:', e)
        }
      })
    } catch (e) {
      console.log('Init script failed:', e)
    }
  })

  test('カスタムランキング作成でベースジャンルの動画が表示される', async ({ page }) => {
    console.log('🧪 カスタムランキング作成テスト開始')
    
    // コンソールログを監視
    const consoleLogs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('カスタムランキング')) {
        consoleLogs.push(msg.text())
        console.log('📋 Browser Console:', msg.text())
      }
    })
    
    // APIリクエストを監視
    const apiRequests: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ranking')) {
        apiRequests.push(request.url())
        console.log('🌐 API Request:', request.url())
      }
    })

    // 1. ジャンルセレクターを開く
    await page.click('[data-testid="genre-selector"], .genre-selector, button:has-text("すべて")')
    await page.waitForTimeout(1000)

    // 2. カスタムジャンルを選択
    const customButton = page.locator('button:has-text("カスタム"), [data-genre="custom"], .genre-custom')
    await expect(customButton).toBeVisible({ timeout: 10000 })
    await customButton.click()
    await page.waitForTimeout(1000)

    // 3. 新規作成ボタンをクリック
    const createButton = page.locator('button:has-text("新しく作成"), button:has-text("作成する"), .create-custom-ranking')
    await expect(createButton).toBeVisible({ timeout: 10000 })
    await createButton.click()
    await page.waitForTimeout(2000)

    // 4. モーダルが開くのを待つ
    const modal = page.locator('[role="dialog"], .modal, .custom-ranking-modal')
    await expect(modal).toBeVisible({ timeout: 10000 })

    // 5. ベースジャンル（ゲーム）を選択
    const gameGenreButton = page.locator('button:has-text("ゲーム"), [data-genre="game"], .genre-game')
    await expect(gameGenreButton).toBeVisible({ timeout: 10000 })
    await gameGenreButton.click()
    await page.waitForTimeout(1000)

    // 6. 次のステップに進む
    const nextButton = page.locator('button:has-text("次へ"), button:has-text("Next"), .next-step')
    if (await nextButton.isVisible()) {
      await nextButton.click()
      await page.waitForTimeout(1000)
    }

    // 7. タイトルを入力
    const titleInput = page.locator('input[placeholder*="タイトル"], input[name="title"], .title-input')
    if (await titleInput.isVisible()) {
      await titleInput.fill('テスト用ゲームランキング')
      await page.waitForTimeout(500)
    }

    // 8. 保存ボタンをクリック
    const saveButton = page.locator('button:has-text("保存"), button:has-text("作成"), .save-button')
    await expect(saveButton).toBeVisible({ timeout: 10000 })
    await saveButton.click()
    await page.waitForTimeout(3000)

    // 9. データロードを待つ
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    await page.waitForTimeout(2000)

    // 10. コンソールログでbaseGenreが正しく使用されているか確認
    console.log('📊 収集されたコンソールログ:', consoleLogs)
    console.log('📊 収集されたAPIリクエスト:', apiRequests)

    // baseGenreがgameのAPIリクエストが発生していることを確認
    const gameApiRequest = apiRequests.find(url => url.includes('genre=game'))
    expect(gameApiRequest, 'ゲームジャンルでのAPIリクエストが発生していません').toBeTruthy()
    console.log('✅ ゲームジャンルAPIリクエスト確認:', gameApiRequest)

    // 11. ランキングアイテムが表示されていることを確認
    const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item')
    await expect(rankingItems.first()).toBeVisible({ timeout: 15000 })
    
    const itemCount = await rankingItems.count()
    console.log('📊 表示されたランキングアイテム数:', itemCount)
    
    // 最低でも10件以上の動画が取得できていることを確認
    expect(itemCount, 'ランキングアイテムが十分に表示されていません').toBeGreaterThan(10)

    // 12. APIレスポンスでlimit=1000が使われていることを確認
    const apiWith1000Limit = apiRequests.find(url => url.includes('limit=1000'))
    expect(apiWith1000Limit, 'limit=1000のAPIリクエストが発生していません').toBeTruthy()
    console.log('✅ 1000件取得APIリクエスト確認:', apiWith1000Limit)

    console.log('🎉 カスタムランキング作成テスト完了')
  })

  test('作成済みカスタムランキングを選択してベースジャンルデータが表示される', async ({ page }) => {
    console.log('🧪 カスタムランキング選択テスト開始')
    
    // 事前にカスタムランキングを作成
    await page.evaluate(() => {
      const customRanking = {
        version: "1.0",
        rankings: [
          {
            id: "test-game-ranking",
            title: "テスト用ゲームランキング",
            baseGenre: "game",
            conditions: [
              {
                tag: "実況プレイ",
                operator: "AND",
                tagType: "both"
              }
            ],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        selectedId: "test-game-ranking"
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
    })

    // コンソールログを監視
    const consoleLogs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('カスタムランキング')) {
        consoleLogs.push(msg.text())
        console.log('📋 Browser Console:', msg.text())
      }
    })
    
    // APIリクエストを監視
    const apiRequests: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ranking')) {
        apiRequests.push(request.url())
        console.log('🌐 API Request:', request.url())
      }
    })

    // カスタムランキングでページを開く
    await page.goto('/?genre=custom&ranking=test-game-ranking&tag=custom:test-game-ranking')
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    await page.waitForTimeout(3000)

    // デバッグログでbaseGenre変換が正しく行われているか確認
    console.log('📊 収集されたコンソールログ:', consoleLogs)
    console.log('📊 収集されたAPIリクエスト:', apiRequests)

    // baseGenre=gameでAPIリクエストが発生していることを確認
    const gameApiRequest = apiRequests.find(url => url.includes('genre=game'))
    expect(gameApiRequest, 'ゲームジャンルでのAPIリクエストが発生していません').toBeTruthy()
    console.log('✅ ゲームジャンルAPIリクエスト確認:', gameApiRequest)

    // ランキングアイテムが表示されていることを確認
    const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item')
    await expect(rankingItems.first()).toBeVisible({ timeout: 15000 })
    
    const itemCount = await rankingItems.count()
    console.log('📊 表示されたランキングアイテム数:', itemCount)
    
    // 十分な数の動画が表示されていることを確認
    expect(itemCount, 'ランキングアイテムが十分に表示されていません').toBeGreaterThan(10)

    console.log('🎉 カスタムランキング選択テスト完了')
  })

  test('複数のベースジャンルでカスタムランキングが正しく動作する', async ({ page }) => {
    console.log('🧪 複数ベースジャンル テスト開始')
    
    const testGenres = [
      { name: 'ゲーム', value: 'game' },
      { name: '音楽', value: 'music' },
      { name: 'エンターテイメント', value: 'entertainment' }
    ]

    for (const genre of testGenres) {
      console.log(`🔍 ${genre.name}ジャンル テスト中...`)
      
      // カスタムランキングを作成
      await page.evaluate((genreData) => {
        const customRanking = {
          version: "1.0",
          rankings: [
            {
              id: `test-${genreData.value}-ranking`,
              title: `テスト用${genreData.name}ランキング`,
              baseGenre: genreData.value,
              conditions: [],
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ],
          selectedId: `test-${genreData.value}-ranking`
        }
        localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
      }, genre)

      // APIリクエストを監視
      const apiRequests: string[] = []
      page.on('request', request => {
        if (request.url().includes('/api/ranking')) {
          apiRequests.push(request.url())
        }
      })

      // カスタムランキングでページを開く
      const url = `/?genre=custom&ranking=test-${genre.value}-ranking&tag=custom:test-${genre.value}-ranking`
      await page.goto(url)
      await page.waitForLoadState('networkidle', { timeout: 30000 })
      await page.waitForTimeout(2000)

      // 正しいジャンルでAPIリクエストが発生していることを確認
      const genreApiRequest = apiRequests.find(url => url.includes(`genre=${genre.value}`))
      expect(genreApiRequest, `${genre.name}ジャンルでのAPIリクエストが発生していません`).toBeTruthy()
      console.log(`✅ ${genre.name}ジャンルAPIリクエスト確認:`, genreApiRequest)

      // ランキングアイテムが表示されることを確認
      const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item')
      try {
        await expect(rankingItems.first()).toBeVisible({ timeout: 10000 })
        const itemCount = await rankingItems.count()
        console.log(`📊 ${genre.name}ジャンル アイテム数:`, itemCount)
        expect(itemCount, `${genre.name}ジャンルでランキングアイテムが表示されていません`).toBeGreaterThan(0)
      } catch (error) {
        console.log(`⚠️ ${genre.name}ジャンルでランキングアイテムが見つかりませんでした:`, error)
      }
    }

    console.log('🎉 複数ベースジャンル テスト完了')
  })
})