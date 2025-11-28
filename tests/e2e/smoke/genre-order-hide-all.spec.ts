import { test, expect } from '@playwright/test'

// TODO: 設定モーダルの開閉に問題があるため一時的にスキップ
// Issue: タブボタンのテキストにnbspが含まれており、セレクタがマッチしない
// 修正後に再度有効化する必要がある
test.describe('ジャンル順序 - すべて表示/非表示機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // 設定モーダルを開く
    const settingsButton = page.locator('button[aria-label="設定"]')
    
    // デバッグ：ボタンの存在を確認
    const settingsCount = await settingsButton.count()
    console.log(`Settings button found: ${settingsCount}`)
    
    // ボタンがクリック可能になるまで待機
    await settingsButton.waitFor({ state: 'visible' })
    await settingsButton.click()
    
    // モーダルが開くまで待機
    try {
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    } catch (error) {
      console.log('Modal not found with role="dialog", trying alternative selector')
      // 設定モーダルの代替セレクタを試す
      await page.waitForSelector('div:has(button:has-text("テーマ"))', { timeout: 5000 })
    }
    await page.waitForTimeout(500)
    
    // ジャンルタブを探してクリック
    let genreTab = page.locator('[role="dialog"] button').filter({ hasText: 'ジャンル' })
    const genreTabCount = await genreTab.count()
    
    if (genreTabCount === 0) {
      // role="dialog"が見つからない場合は、代替セレクタを使用
      genreTab = page.locator('button').filter({ hasText: 'ジャンル' })
      console.log(`Using alternative selector for genre tab`)
    }
    
    await genreTab.click()
    await page.waitForTimeout(500)
  })

  test('すべて表示/非表示ボタンが表示される', async ({ page }) => {
    // 3つのボタンが表示されることを確認
    const resetButton = page.getByRole('button', { name: 'デフォルトに戻す' })
    const showAllButton = page.getByRole('button', { name: 'すべて表示にする' })
    const hideAllButton = page.getByRole('button', { name: 'すべて非表示にする' })
    
    await expect(resetButton).toBeVisible()
    await expect(showAllButton).toBeVisible()
    await expect(hideAllButton).toBeVisible()
  })

  test('すべて非表示にするボタンをクリックするとすべてのジャンルが非表示になる', async ({ page }) => {
    // 初期状態では総合ジャンルが表示されている（opacity確認）
    const allGenreItem = page.locator('[data-genre="all"]')
    const initialOpacity = await allGenreItem.evaluate(el => getComputedStyle(el).opacity)
    expect(initialOpacity).toBe('1')
    
    // すべて非表示にするボタンをクリック
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になることを確認（CSS modules対応）
    const genreItems = page.locator('[data-genre]')
    const count = await genreItems.count()
    
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      expect(opacity).toBe('0.6')
    }
  })

  test('すべて非表示状態から適用すると「表示する動画がありません」が表示される', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // 適用ボタンをクリック
    await page.getByRole('button', { name: '適用' }).click()
    
    // ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // 「表示する動画がありません」というメッセージが表示されることを確認
    await expect(page.getByText('表示する動画がありません')).toBeVisible()
    
    // ジャンルセレクターに「すべてのジャンルが非表示になっています」と表示される
    await expect(page.getByText('すべてのジャンルが非表示になっています')).toBeVisible()
  })

  test('すべて非表示状態からデフォルトに戻すことができる', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になったことを確認（CSS modules対応）
    const hiddenItems = page.locator('[data-genre]').filter({ hasText: /総合|エンターテイメント|ラジオ|音楽|歌ってみた|演奏してみた|踊ってみた|VOCALOID|ニコニコインディーズ|動物|料理|自然|旅行・アウトドア|乗り物|スポーツ|社会・政治・時事|技術・工学|ニコニコ動画講座|科学・技術|歴史|政治|アニメ|ゲーム|実況プレイ動画|東方|アイドルマスター|ラジオ|描いてみた|作ってみた|ニコニコ手芸部|ニコニコ技術部|ニコニコ動画講座|解説・講座|車載動画|例のアレ|日記|その他/ }).locator(':scope').filter({ has: page.locator('.hidden') })
    
    // CSS modules でのhidden class確認のため、opacity スタイルでチェック
    const genreItems = page.locator('[data-genre]')
    const count = await genreItems.count()
    let hiddenCount = 0
    
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      if (opacity === '0.6') {
        hiddenCount++
      }
    }
    
    expect(hiddenCount).toBe(23)
    
    // デフォルトに戻す
    await page.getByRole('button', { name: 'デフォルトに戻す' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが表示されることを確認（opacity が1に戻る）
    let visibleCount = 0
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      if (opacity === '1') {
        visibleCount++
      }
    }
    
    expect(visibleCount).toBe(23)
  })

  test('すべて非表示にしてから一部のジャンルを表示できる', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // 音楽ジャンルを表示する
    const musicItem = page.locator('[data-genre="music"]')
    const musicToggle = musicItem.locator('button[aria-label*="表示"]')
    await musicToggle.click()
    await page.waitForTimeout(100)
    
    // 音楽ジャンルのみが表示されることを確認（CSS modules対応）
    const musicOpacity = await musicItem.evaluate(el => getComputedStyle(el).opacity)
    expect(musicOpacity).toBe('1')
    
    // 他のジャンルは非表示のまま
    const otherItems = page.locator('[data-genre]:not([data-genre="music"])')
    const otherCount = await otherItems.count()
    
    for (let i = 0; i < otherCount; i++) {
      const item = otherItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      expect(opacity).toBe('0.6')
    }
  })

  test('すべて表示にするボタンでジャンルが全て表示される', async ({ page }) => {
    // まず一部のジャンルを非表示にする
    const musicItem = page.locator('[data-genre="music"]')
    const gameItem = page.locator('[data-genre="game"]')
    const animeItem = page.locator('[data-genre="anime"]')
    
    await musicItem.locator('button[aria-label*="非表示"]').click()
    await page.waitForTimeout(100)
    await gameItem.locator('button[aria-label*="非表示"]').click()
    await page.waitForTimeout(100)
    await animeItem.locator('button[aria-label*="非表示"]').click()
    await page.waitForTimeout(100)
    
    // 3つのジャンルが非表示になったことを確認（CSS modules対応）
    const musicOpacity = await musicItem.evaluate(el => getComputedStyle(el).opacity)
    const gameOpacity = await gameItem.evaluate(el => getComputedStyle(el).opacity)
    const animeOpacity = await animeItem.evaluate(el => getComputedStyle(el).opacity)
    
    expect(musicOpacity).toBe('0.6')
    expect(gameOpacity).toBe('0.6')
    expect(animeOpacity).toBe('0.6')
    
    // すべて表示にするボタンをクリック
    await page.getByRole('button', { name: 'すべて表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが表示されることを確認（CSS modules対応）
    const genreItems = page.locator('[data-genre]')
    const count = await genreItems.count()
    
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      expect(opacity).toBe('1')
    }
  })

  test('すべて表示とすべて非表示を交互に切り替えできる', async ({ page }) => {
    // すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になったことを確認（CSS modules対応）
    const genreItems = page.locator('[data-genre]')
    const count = await genreItems.count()
    let hiddenCount = 0
    
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      if (opacity === '0.6') {
        hiddenCount++
      }
    }
    expect(hiddenCount).toBe(23)
    
    // すべて表示にする
    await page.getByRole('button', { name: 'すべて表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが表示されることを確認（opacity が1に戻る）
    let visibleCount = 0
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      if (opacity === '1') {
        visibleCount++
      }
    }
    expect(visibleCount).toBe(23)
    
    // 再度すべて非表示にする
    await page.getByRole('button', { name: 'すべて非表示にする' }).click()
    await page.waitForTimeout(200)
    
    // すべてのジャンルが非表示になったことを確認（再度opacity確認）
    hiddenCount = 0
    for (let i = 0; i < count; i++) {
      const item = genreItems.nth(i)
      const opacity = await item.evaluate(el => getComputedStyle(el).opacity)
      if (opacity === '0.6') {
        hiddenCount++
      }
    }
    expect(hiddenCount).toBe(23)
  })
})