import { test, expect } from '@playwright/test'

test.describe('カスタムランキング - 作成・編集テスト', () => {
  test('カスタムランキング作成後にbaseGenreにリダイレクト', async ({ page }) => {
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
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    
    // カスタムジャンルを選択
    const customButton = page.locator('button').filter({ hasText: /^カスタム$/ })
    await customButton.first().click()
    console.log('✅ 「カスタム」ボタンをクリック')
    await page.waitForTimeout(1000)
    
    // 新規作成ボタンをクリック
    const createButton = page.locator('button').filter({ hasText: '新しく作成' })
    await createButton.click()
    console.log('✅ 「新しく作成」ボタンをクリック')
    await page.waitForTimeout(1000)
    
    // モーダルが開くのを待つ
    const modalHeader = page.locator('h2').filter({ hasText: 'カスタムランキング作成' })
    await expect(modalHeader).toBeVisible({ timeout: 5000 })
    console.log('✅ モーダルが開きました')
    
    // Step 1: ベースジャンル選択
    const musicGenreOption = page.locator('label').filter({ hasText: '音楽' })
    await musicGenreOption.click()
    console.log('✅ ベースジャンル「音楽」を選択')
    
    // 次へボタンをクリック
    const nextButton = page.locator('button').filter({ hasText: '次へ' })
    await nextButton.click()
    console.log('✅ 「次へ」ボタンをクリック')
    await page.waitForTimeout(500)
    
    // Step 2: タグ条件を追加
    const tagInput = page.locator('input[placeholder="タグを入力"]')
    await tagInput.fill('歌ってみた')
    console.log('✅ タグを入力')
    
    // タグを追加
    const addTagButton = page.locator('button').filter({ hasText: '追加' })
    await addTagButton.click()
    console.log('✅ タグを追加')
    await page.waitForTimeout(500)
    
    // 次へボタンをクリック
    const nextToStep3 = page.locator('button').filter({ hasText: '次へ' }).last()
    await nextToStep3.click()
    console.log('✅ Step 3へ進む')
    await page.waitForTimeout(500)
    
    // Step 3: タイトル入力
    const titleInput = page.locator('input[placeholder="例: レトロゲーム実況"]')
    await titleInput.fill('テスト音楽ランキング')
    console.log('✅ タイトルを入力')
    
    // 作成ボタンをクリック
    const submitButton = page.locator('button').filter({ hasText: /作成|保存/ }).last()
    await submitButton.click()
    console.log('✅ 作成ボタンをクリック')
    await page.waitForTimeout(2000)
    
    // URLを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    
    // genre=musicになっていることを確認
    expect(currentUrl).toContain('genre=music')
    expect(currentUrl).not.toContain('genre=custom')
    
    // APIリクエストを確認
    const musicApiRequest = apiRequests.find(url => url.includes('genre=music'))
    expect(musicApiRequest).toBeTruthy()
    console.log('✅ 音楽ジャンルのAPIリクエストを確認')
    
    console.log('🎉 カスタムランキング作成テスト完了')
  })
  
  test('既存のカスタムランキング編集後にbaseGenreにリダイレクト', async ({ page }) => {
    console.log('🧪 カスタムランキング編集テスト開始')
    
    // 既存のカスタムランキングを作成
    await page.addInitScript(() => {
      const customRanking = {
        version: "1.0",
        rankings: [
          {
            id: "existing-anime-ranking",
            title: "既存のアニメランキング",
            baseGenre: "anime",
            conditions: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        selectedId: null
      }
      localStorage.setItem('custom-rankings', JSON.stringify(customRanking))
    })
    
    // ホームページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    
    // カスタムジャンルを選択
    const customButton = page.locator('button').filter({ hasText: /^カスタム$/ })
    await customButton.first().click()
    await page.waitForTimeout(1000)
    
    // 編集ボタンをクリック（絵文字の鉛筆）
    const editButton = page.locator('button').filter({ hasText: '✏️' }).first()
    await editButton.click()
    console.log('✅ 編集ボタンをクリック')
    await page.waitForTimeout(1000)
    
    // モーダルのStep 1でベースジャンルを変更
    const techGenreOption = page.locator('label').filter({ hasText: '技術・工作' })
    await techGenreOption.click()
    console.log('✅ ベースジャンルを「技術・工作」に変更')
    
    // 次へボタンをクリック
    const nextButton = page.locator('button').filter({ hasText: '次へ' })
    await nextButton.click()
    await page.waitForTimeout(500)
    
    // Step 2: タグ条件はStep2に進むが、何も追加せずにStep3へ
    await page.waitForTimeout(500)
    const tagInput = page.locator('input[placeholder="タグを入力"]')
    await tagInput.fill('テストタグ')
    const addTagButton = page.locator('button').filter({ hasText: '追加' })
    await addTagButton.click()
    await page.waitForTimeout(500)
    
    const nextToStep3 = page.locator('button').filter({ hasText: '次へ' }).last()
    await nextToStep3.click()
    console.log('✅ Step 3へ進む')
    await page.waitForTimeout(500)
    
    // 保存ボタンをクリック
    const saveButton = page.locator('button').filter({ hasText: /保存|更新/ }).last()
    await saveButton.click()
    console.log('✅ 保存ボタンをクリック')
    await page.waitForTimeout(2000)
    
    // URLを確認
    const currentUrl = page.url()
    console.log('📍 現在のURL:', currentUrl)
    
    // genre=technologyになっていることを確認
    expect(currentUrl).toContain('genre=technology')
    expect(currentUrl).not.toContain('genre=custom')
    
    console.log('🎉 カスタムランキング編集テスト完了')
  })
})