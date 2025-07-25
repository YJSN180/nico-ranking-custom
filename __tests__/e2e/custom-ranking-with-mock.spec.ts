/**
 * カスタムランキング機能のE2Eテスト（モックデータ使用）
 * 
 * このテストはモックデータを使用して、実際のAPIに依存せずに
 * カスタムランキングのタグフィルタリング機能をテストします。
 */

import { test, expect } from '@playwright/test'
import { 
  setupMockApiRoutes, 
  customRankingTestCases,
  gameGenreMockData,
  otherGenreMockData 
} from '../fixtures/custom-ranking-mock-data'

test.describe('カスタムランキング機能（モックデータ版）', () => {
  test.beforeEach(async ({ page }) => {
    // モックAPIルートをセットアップ
    setupMockApiRoutes(page)
    
    // ページに移動
    await page.goto('/')
  })

  test('レトロVOICEROID実況のカスタムランキング作成・検証', async ({ page }) => {
    const testCase = customRankingTestCases.find(tc => tc.id === 'retro-voiceroid-gameplay')!

    // ゲームジャンルに移動
    await page.click('[data-testid="genre-selector"] >> text=ゲーム')
    
    // モックデータが読み込まれるまで待機
    await expect(page.locator('text=レトロゲーム実況プレイ Part1【ファミコン名作集】')).toBeVisible()

    // カスタムランキング作成ボタンをクリック
    await page.click('[data-testid="create-custom-ranking"]')
    
    // ステップ1: ベースジャンル選択（ゲームは既に選択済みのはず）
    await expect(page.locator('input[value="game"]:checked')).toBeVisible()
    await page.click('text=次へ')

    // ステップ2: タグ条件設定
    // 1つ目の条件: VOICEROID実況プレイ（ロックタグ）
    await page.fill('[data-testid="tag-input"]', testCase.conditions[0].tag)
    await page.click(`text=${testCase.conditions[0].operator}`)
    await page.click('text=ロックタグ')
    await page.click('text=追加')

    // 2つ目の条件: レトロゲーム（ユーザータグ）
    await page.fill('[data-testid="tag-input"]', testCase.conditions[1].tag)
    await page.click(`text=${testCase.conditions[1].operator}`)
    await page.click('text=ユーザータグ')
    await page.click('text=追加')

    await page.click('text=次へ')

    // ステップ3: タイトル設定
    await page.fill('[data-testid="title-input"]', testCase.title)
    await page.click('text=保存')

    // カスタムランキングが作成され、フィルタリングが適用されることを確認
    await expect(page.locator(`text=${testCase.title}`)).toBeVisible()
    
    // 期待される結果のみが表示されることを確認
    for (const expectedVideoId of testCase.expectedResults) {
      const expectedVideo = gameGenreMockData.find(item => item.videoId === expectedVideoId)!
      await expect(page.locator(`text=${expectedVideo.title}`)).toBeVisible()
    }

    // 期待されない結果が表示されていないことを確認
    const unexpectedVideos = gameGenreMockData.filter(
      item => !testCase.expectedResults.includes(item.videoId)
    )
    for (const unexpectedVideo of unexpectedVideos) {
      await expect(page.locator(`text=${unexpectedVideo.title}`)).not.toBeVisible()
    }

    // 結果数の確認
    const videoElements = await page.locator('[data-testid="ranking-item"]').count()
    expect(videoElements).toBe(testCase.expectedCount)
  })

  test('真夏の夜の淫夢タグでのカスタムランキング作成', async ({ page }) => {
    const testCase = customRankingTestCases.find(tc => tc.id === 'yaju-series')!

    // その他ジャンルに移動
    await page.click('[data-testid="genre-selector"] >> text=その他')
    
    // モックデータが読み込まれるまで待機
    await expect(page.locator('text=野獣先輩BB劇場シリーズ')).toBeVisible()

    // カスタムランキング作成
    await page.click('[data-testid="create-custom-ranking"]')
    
    // ステップ1: ベースジャンル選択（その他）
    await page.click('input[value="other"]')
    await page.click('text=次へ')

    // ステップ2: タグ条件設定
    await page.fill('[data-testid="tag-input"]', testCase.conditions[0].tag)
    await page.click(`text=${testCase.conditions[0].operator}`)
    await page.click('text=ユーザータグ')
    await page.click('text=追加')
    await page.click('text=次へ')

    // ステップ3: タイトル設定
    await page.fill('[data-testid="title-input"]', testCase.title)
    await page.click('text=保存')

    // 結果の確認
    await expect(page.locator(`text=${testCase.title}`)).toBeVisible()
    
    // 期待される結果の確認
    for (const expectedVideoId of testCase.expectedResults) {
      const expectedVideo = otherGenreMockData.find(item => item.videoId === expectedVideoId)!
      await expect(page.locator(`text=${expectedVideo.title}`)).toBeVisible()
    }

    // 結果数の確認
    const videoElements = await page.locator('[data-testid="ranking-item"]').count()
    expect(videoElements).toBe(testCase.expectedCount)
  })

  test('NOT条件（除外）を含むカスタムランキング', async ({ page }) => {
    const testCase = customRankingTestCases.find(tc => tc.id === 'exclude-horror')!

    // ゲームジャンルに移動
    await page.click('[data-testid="genre-selector"] >> text=ゲーム')
    
    // カスタムランキング作成
    await page.click('[data-testid="create-custom-ranking"]')
    
    // ステップ1: ベースジャンル選択
    await expect(page.locator('input[value="game"]:checked')).toBeVisible()
    await page.click('text=次へ')

    // ステップ2: 複数の条件設定
    for (const condition of testCase.conditions) {
      await page.fill('[data-testid="tag-input"]', condition.tag)
      await page.click(`text=${condition.operator}`)
      
      if (condition.tagType === 'lock') {
        await page.click('text=ロックタグ')
      } else if (condition.tagType === 'user') {
        await page.click('text=ユーザータグ')
      } else {
        await page.click('text=両方')
      }
      
      await page.click('text=追加')
    }

    await page.click('text=次へ')

    // ステップ3: タイトル設定
    await page.fill('[data-testid="title-input"]', testCase.title)
    await page.click('text=保存')

    // 結果の確認 - ホラーゲームが除外されていることを確認
    await expect(page.locator(`text=${testCase.title}`)).toBeVisible()
    
    // ホラーゲーム動画が表示されていないことを確認
    await expect(page.locator('text=モダンホラーゲーム実況')).not.toBeVisible()
    
    // 他の実況動画は表示されていることを確認
    await expect(page.locator('text=レトロゲーム実況プレイ Part1【ファミコン名作集】')).toBeVisible()
    await expect(page.locator('text=VOICEROID実況によるレトロRPG冒険記')).toBeVisible()
    
    // 結果数の確認
    const videoElements = await page.locator('[data-testid="ranking-item"]').count()
    expect(videoElements).toBe(testCase.expectedCount)
  })

  test('カスタムランキングの切り替えが正常に動作する', async ({ page }) => {
    // 複数のカスタムランキングを作成して切り替えテスト
    const testCase1 = customRankingTestCases.find(tc => tc.id === 'retro-voiceroid-gameplay')!
    const testCase2 = customRankingTestCases.find(tc => tc.id === 'horror-user-tag')!

    // ゲームジャンルに移動
    await page.click('[data-testid="genre-selector"] >> text=ゲーム')

    // 1つ目のカスタムランキング作成（省略した実装）
    // ... (作成プロセス)

    // 2つ目のカスタムランキング作成（省略した実装）
    // ... (作成プロセス)

    // カスタムランキング切り替えの確認
    await page.click(`text=${testCase1.title}`)
    const videoCount1 = await page.locator('[data-testid="ranking-item"]').count()
    expect(videoCount1).toBe(testCase1.expectedCount)

    await page.click(`text=${testCase2.title}`)
    const videoCount2 = await page.locator('[data-testid="ranking-item"]').count()
    expect(videoCount2).toBe(testCase2.expectedCount)
  })

  test('ページリロード後もカスタムランキングが保持される', async ({ page }) => {
    const testCase = customRankingTestCases.find(tc => tc.id === 'retro-voiceroid-gameplay')!

    // カスタムランキング作成（省略）
    // ... (作成プロセス)

    // ページをリロード
    await page.reload()
    
    // モックデータの再セットアップ
    setupMockApiRoutes(page)
    
    // カスタムランキングが保持されていることを確認
    await expect(page.locator(`text=${testCase.title}`)).toBeVisible()
    
    // フィルタリング結果も正しく復元されることを確認
    const videoElements = await page.locator('[data-testid="ranking-item"]').count()
    expect(videoElements).toBe(testCase.expectedCount)
  })
})