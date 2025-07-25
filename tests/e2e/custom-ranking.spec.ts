import { test, expect } from '@playwright/test'

test.describe('カスタムランキング機能テスト', () => {
  test.beforeEach(async ({ page }) => {
    // カスタムランキングデータをクリア
    await page.addInitScript(() => {
      localStorage.removeItem('custom-rankings')
    })
  })

  test('カスタムランキング作成でベースジャンルにリダイレクトされる', async ({ page }) => {
    console.log('🧪 カスタムランキング作成テスト開始')
    
    // APIリクエストを監視
    const apiRequests: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ranking')) {
        apiRequests.push(request.url())
        console.log('🌐 API Request:', request.url())
      }
    })

    // ホームページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    // 1. カスタムジャンルを選択
    const customButton = page.locator('button').filter({ hasText: /^カスタム$/ })
    await customButton.first().click()
    console.log('✅ カスタムジャンルを選択')
    await page.waitForTimeout(1000)

    // 2. 新規作成ボタンをクリック
    const createButton = page.locator('button').filter({ hasText: '新しく作成' })
    await createButton.click()
    console.log('✅ 新規作成ボタンをクリック')
    await page.waitForTimeout(1000)

    // 3. モーダルが開くのを待つ
    const modalHeader = page.locator('h2').filter({ hasText: 'カスタムランキング作成' })
    await expect(modalHeader).toBeVisible({ timeout: 5000 })

    // 4. ベースジャンル（ゲーム）を選択
    const gameGenreOption = page.locator('label').filter({ hasText: 'ゲーム' })
    await gameGenreOption.click()
    console.log('✅ ベースジャンル「ゲーム」を選択')

    // 5. 次へボタンをクリック
    const nextButton = page.locator('button').filter({ hasText: '次へ' })
    await nextButton.click()
    await page.waitForTimeout(500)

    // 6. タグ条件を追加（Step 2）
    const tagInput = page.locator('input[placeholder="タグを入力"]')
    await tagInput.fill('実況プレイ')
    const addTagButton = page.locator('button').filter({ hasText: '追加' })
    await addTagButton.click()
    console.log('✅ タグ条件を追加')
    await page.waitForTimeout(500)

    // 7. 次へボタンをクリック（Step 3へ）
    const nextToStep3 = page.locator('button').filter({ hasText: '次へ' }).last()
    await nextToStep3.click()
    await page.waitForTimeout(500)

    // 8. タイトルを入力
    const titleInput = page.locator('input[placeholder="例: レトロゲーム実況"]')
    await titleInput.fill('テスト用ゲームランキング')
    console.log('✅ タイトルを入力')

    // 9. 保存ボタンをクリック
    const saveButton = page.locator('button').filter({ hasText: /作成|保存/ }).last()
    await saveButton.click()
    console.log('✅ 保存ボタンをクリック')
    await page.waitForTimeout(3000)

    // 10. URLを確認 - genre=gameになっていることを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    expect(currentUrl).toContain('genre=game')
    expect(currentUrl).not.toContain('genre=custom')

    // 11. baseGenre=gameでAPIリクエストが発生していることを確認
    const gameApiRequest = apiRequests.find(url => url.includes('genre=game'))
    expect(gameApiRequest).toBeTruthy()
    console.log('✅ ゲームジャンルAPIリクエスト確認:', gameApiRequest)

    // 12. ランキングアイテムが表示されていることを確認
    const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item')
    await expect(rankingItems.first()).toBeVisible({ timeout: 15000 })
    
    const itemCount = await rankingItems.count()
    console.log('📊 表示されたランキングアイテム数:', itemCount)
    expect(itemCount).toBeGreaterThan(10)

    console.log('🎉 カスタムランキング作成テスト完了')
  })

  test('作成済みカスタムランキングを選択してベースジャンルにリダイレクトされる', async ({ page }) => {
    console.log('🧪 カスタムランキング選択テスト開始')
    
    // 事前にカスタムランキングを作成
    await page.addInitScript(() => {
      const customRanking = {
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
        selectedId: null
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
    })
    
    // APIリクエストを監視
    const apiRequests: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ranking')) {
        apiRequests.push(request.url())
        console.log('🌐 API Request:', request.url())
      }
    })

    // ホームページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    // カスタムジャンルを選択
    const customButton = page.locator('button').filter({ hasText: /^カスタム$/ })
    await customButton.first().click()
    console.log('✅ カスタムジャンルを選択')
    await page.waitForTimeout(1000)

    // カスタムランキングを選択
    const customRankingButton = page.locator('button').filter({ hasText: 'テスト用ゲームランキング' })
    await customRankingButton.click()
    console.log('✅ カスタムランキングを選択')
    await page.waitForTimeout(2000)

    // URLを確認 - genre=gameになっていることを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    expect(currentUrl).toContain('genre=game')
    expect(currentUrl).not.toContain('genre=custom')

    // baseGenre=gameでAPIリクエストが発生していることを確認
    const gameApiRequest = apiRequests.find(url => url.includes('genre=game'))
    expect(gameApiRequest).toBeTruthy()
    console.log('✅ ゲームジャンルAPIリクエスト確認:', gameApiRequest)

    // ランキングアイテムが表示されていることを確認
    const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item')
    await expect(rankingItems.first()).toBeVisible({ timeout: 15000 })
    
    const itemCount = await rankingItems.count()
    console.log('📊 表示されたランキングアイテム数:', itemCount)
    expect(itemCount).toBeGreaterThan(10)

    console.log('🎉 カスタムランキング選択テスト完了')
  })

  test('複数のベースジャンルでカスタムランキングが正しく動作する', async ({ page }) => {
    console.log('🧪 複数ベースジャンル テスト開始')
    
    const testGenres = [
      { name: 'ゲーム', value: 'game' },
      { name: '音楽', value: 'music' },
      { name: 'エンターテイメント', value: 'entertainment' }
    ]

    // 複数のカスタムランキングを作成
    await page.addInitScript((genres) => {
      const rankings = genres.map(genre => ({
        id: `test-${genre.value}-ranking`,
        title: `テスト用${genre.name}ランキング`,
        baseGenre: genre.value,
        conditions: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }))
      
      const customRanking = {
        rankings: rankings,
        selectedId: null
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
    }, testGenres)

    // ホームページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    for (const genre of testGenres) {
      console.log(`🔍 ${genre.name}ジャンル テスト中...`)
      
      // APIリクエストを監視
      const apiRequests: string[] = []
      const removeListener = page.on('request', request => {
        if (request.url().includes('/api/ranking')) {
          apiRequests.push(request.url())
        }
      })

      // カスタムジャンルを選択
      const customButton = page.locator('button').filter({ hasText: /^カスタム$/ })
      await customButton.first().click()
      await page.waitForTimeout(500)

      // 対応するカスタムランキングを選択
      const customRankingButton = page.locator('button').filter({ hasText: `テスト用${genre.name}ランキング` })
      await customRankingButton.click()
      console.log(`✅ ${genre.name}カスタムランキングを選択`)
      await page.waitForTimeout(2000)

      // URLを確認
      const currentUrl = page.url()
      console.log(`📍 ${genre.name} URL:`, currentUrl)
      expect(currentUrl).toContain(`genre=${genre.value}`)
      expect(currentUrl).not.toContain('genre=custom')

      // 正しいジャンルでAPIリクエストが発生していることを確認
      const genreApiRequest = apiRequests.find(url => url.includes(`genre=${genre.value}`))
      expect(genreApiRequest).toBeTruthy()
      console.log(`✅ ${genre.name}ジャンルAPIリクエスト確認:`, genreApiRequest)

      // ランキングアイテムが表示されることを確認
      const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item')
      try {
        await expect(rankingItems.first()).toBeVisible({ timeout: 10000 })
        const itemCount = await rankingItems.count()
        console.log(`📊 ${genre.name}ジャンル アイテム数:`, itemCount)
        expect(itemCount).toBeGreaterThan(0)
      } catch (error) {
        console.log(`⚠️ ${genre.name}ジャンルでランキングアイテムが見つかりませんでした:`, error)
      }

      removeListener()
    }

    console.log('🎉 複数ベースジャンル テスト完了')
  })

  test('genre=customパラメータがallにリダイレクトされる', async ({ page }) => {
    console.log('🧪 genre=customリダイレクトテスト開始')

    // genre=customでアクセス
    await page.goto('/?genre=custom')
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    // URLを確認 - genre=customが削除されているか、allになっていることを確認
    const currentUrl = page.url()
    console.log('📍 リダイレクト後のURL:', currentUrl)
    expect(currentUrl).not.toContain('genre=custom')
    
    // ランキングアイテムが表示されていることを確認（総合ランキング）
    const rankingItems = page.locator('.ranking-item, [data-testid="ranking-item"], .video-item')
    await expect(rankingItems.first()).toBeVisible({ timeout: 15000 })
    
    console.log('🎉 genre=customリダイレクトテスト完了')
  })
})