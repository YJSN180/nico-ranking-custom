import { test, expect } from '@playwright/test'

test.describe('クリックイベントのデバッグ', () => {
  test('設定ボタンのクリックイベントを確認', async ({ page }) => {
    // コンソールログを有効化
    page.on('console', msg => {
      console.log(`[Browser] ${msg.type()}: ${msg.text()}`)
    })
    
    // ページに移動
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // JavaScriptを実行してイベントリスナーを追加
    await page.evaluate(() => {
      // 設定ボタンを探す
      const button = document.querySelector('button[aria-label="設定"]') as HTMLButtonElement
      if (button) {
        console.log('設定ボタンが見つかりました')
        
        // 既存のonClickハンドラーを確認
        console.log('ボタンのonclick:', button.onclick)
        
        // イベントリスナーを追加してクリックを監視
        button.addEventListener('click', (e) => {
          console.log('クリックイベントが発火しました')
          console.log('イベントターゲット:', e.target)
        }, true)
        
        // React propsを確認
        const reactProps = Object.keys(button).filter(key => key.startsWith('__react'))
        console.log('React props:', reactProps)
      } else {
        console.log('設定ボタンが見つかりません')
      }
    })
    
    // 設定ボタンを探す
    const settingsButton = page.locator('button[aria-label="設定"]')
    await expect(settingsButton).toBeVisible()
    
    // force: trueでクリック
    console.log('Force clickを実行します')
    await settingsButton.click({ force: true })
    
    // 少し待つ
    await page.waitForTimeout(1000)
    
    // DOMの変化を確認
    const hasModal = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*')
      let modalFound = false
      allElements.forEach(el => {
        if (el.className && el.className.toString().includes('modal')) {
          console.log('Modal要素を発見:', el.className, el.tagName)
          modalFound = true
        }
        if (el.className && el.className.toString().includes('overlay')) {
          console.log('Overlay要素を発見:', el.className, el.tagName)
          modalFound = true
        }
      })
      return modalFound
    })
    
    console.log('モーダルが見つかりました:', hasModal)
    
    // Reactコンポーネントの状態を確認
    await page.evaluate(() => {
      // React DevToolsのグローバル変数を確認
      if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        console.log('React DevTools hook is available')
      }
      
      // bodyのinnerHTMLの最後を確認（モーダルは通常最後に追加される）
      const bodyHTML = document.body.innerHTML
      console.log('Body HTMLの最後500文字:', bodyHTML.slice(-500))
    })
    
    // 別の方法でクリック
    console.log('JavaScriptでクリックを実行')
    await page.evaluate(() => {
      const button = document.querySelector('button[aria-label="設定"]') as HTMLButtonElement
      if (button) {
        button.click()
        console.log('JavaScript clickを実行しました')
      }
    })
    
    await page.waitForTimeout(1000)
    
    // 再度モーダルを確認
    const modalCount = await page.locator('[class*="modal"], [class*="overlay"]').count()
    console.log('モーダル/オーバーレイ要素の数:', modalCount)
  })
})