// このE2Eテストは削除されました。
// 理由：Next.jsのハイドレーション状態と設定モーダル表示のデバッグ用テスト
// - デバッグ用のテストであり、正式なテストスイートには不要
// - 単体テストまたは他のE2Eテストでカバー済み

/*
import { test, expect } from '@playwright/test'

test.describe('ハイドレーションの確認', () => {
  test('Next.jsのハイドレーションを待つ', async ({ page }) => {
    // コンソールエラーを監視
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
        console.log(`[Console Error] ${msg.text()}`)
      }
    })
    
    page.on('pageerror', error => {
      errors.push(error.message)
      console.log(`[Page Error] ${error.message}`)
    })
    
    // ページに移動
    await page.goto('/')
    
    // より長く待つ
    console.log('ページの読み込みを待機中...')
    await page.waitForLoadState('domcontentloaded')
    console.log('DOM読み込み完了')
    
    await page.waitForLoadState('load')
    console.log('ページ読み込み完了')
    
    await page.waitForLoadState('networkidle')
    console.log('ネットワークアイドル状態')
    
    // 追加で待機
    await page.waitForTimeout(3000)
    
    // Reactがマウントされているか確認
    const reactStatus = await page.evaluate(() => {
      // window.Reactが存在するか
      const hasReact = typeof (window as any).React !== 'undefined'
      
      // __NEXT_DATA__を確認
      const nextDataScript = document.getElementById('__NEXT_DATA__')
      const hasNextData = !!nextDataScript
      let nextDataContent = null
      if (nextDataScript) {
        try {
          nextDataContent = JSON.parse(nextDataScript.textContent || '{}')
        } catch (e) {
          nextDataContent = 'parse error'
        }
      }
      
      // Reactコンポーネントが存在するか
      const allElements = document.querySelectorAll('*')
      let reactElementCount = 0
      allElements.forEach(el => {
        const keys = Object.keys(el)
        if (keys.some(key => key.startsWith('__react'))) {
          reactElementCount++
        }
      })
      
      return {
        hasReact,
        hasNextData,
        nextDataContent,
        reactElementCount,
        documentReady: document.readyState
      }
    })
    
    console.log('React状態:', JSON.stringify(reactStatus, null, 2))
    
    // 設定ボタンをクリックしてみる
    const button = page.locator('button[aria-label="設定"]')
    await button.click()
    console.log('設定ボタンをクリックしました')
    
    // モーダルを待つ（異なるセレクタを試す）
    try {
      // 複数のセレクタを試す
      const modalSelectors = [
        '[class*="modal"]',
        '[class*="overlay"]',
        'div[role="dialog"]',
        '[data-testid="settings-modal"]',
        'h2:has-text("設定")'
      ]
      
      let modalFound = false
      for (const selector of modalSelectors) {
        const count = await page.locator(selector).count()
        if (count > 0) {
          console.log(`モーダル要素が見つかりました: ${selector} (${count}個)`)
          modalFound = true
        }
      }
      
      if (!modalFound) {
        console.log('モーダル要素が見つかりませんでした')
      }
    } catch (e) {
      console.log('モーダル検索エラー:', e)
    }
    
    // エラーがあれば表示
    if (errors.length > 0) {
      console.log('\n収集されたエラー:')
      errors.forEach(err => console.log('- ' + err))
    }
    
    // 最終的なスクリーンショット（WebKitの制限を考慮）
    try {
      await page.screenshot({ path: 'hydration-test-result.png', fullPage: false })
      console.log('スクリーンショットを保存しました')
    } catch (error) {
      console.log('スクリーンショット保存に失敗:', error.message)
      // viewport内のみでスクリーンショットを試行
      try {
        await page.screenshot({ path: 'hydration-test-viewport.png' })
        console.log('ビューポートのスクリーンショットを保存しました')
      } catch (viewportError) {
        console.log('ビューポートスクリーンショットも失敗:', viewportError.message)
      }
    }
  })
})
*/