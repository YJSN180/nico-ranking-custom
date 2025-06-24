import { test, expect } from '@playwright/test'

test.describe('JavaScript実行確認', () => {
  test('JavaScriptが有効か確認', async ({ page, browserName }) => {
    console.log('ブラウザ:', browserName)
    
    // JavaScriptの有効性を確認
    const jsEnabled = await page.evaluate(() => {
      return true
    })
    console.log('JavaScript有効:', jsEnabled)
    
    // ページに移動
    await page.goto('/')
    
    // JavaScriptの実行状況を確認
    const jsStatus = await page.evaluate(() => {
      return {
        jsEnabled: true,
        reactVersion: (window as any).React?.version || 'not found',
        nextVersion: (window as any).next?.version || 'not found',
        documentReady: document.readyState,
        bodyClasses: document.body.className,
        hasNextScript: !!document.querySelector('script[src*="/_next/"]'),
        scriptCount: document.querySelectorAll('script').length
      }
    })
    
    console.log('JavaScript状態:', JSON.stringify(jsStatus, null, 2))
    
    // 設定ボタンの存在確認
    const settingsButton = await page.locator('button[aria-label="設定"]').count()
    console.log('設定ボタンの数:', settingsButton)
    
    // イベントハンドラーを直接追加してクリック
    await page.evaluate(() => {
      const button = document.querySelector('button[aria-label="設定"]') as HTMLButtonElement
      if (button) {
        // 新しいdivを作成してbodyに追加
        const modal = document.createElement('div')
        modal.id = 'test-modal'
        modal.className = 'test-modal-class'
        modal.textContent = 'テストモーダル'
        modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 1px solid black; z-index: 9999;'
        
        button.addEventListener('click', () => {
          console.log('テストクリックハンドラーが実行されました')
          document.body.appendChild(modal)
        })
        
        // プログラムでクリック
        button.click()
      }
    })
    
    // テストモーダルが表示されるか確認
    const testModal = await page.locator('#test-modal').count()
    console.log('テストモーダルが表示されました:', testModal > 0)
    
    // Next.jsアプリケーションのマウント状態を確認
    await page.waitForTimeout(2000)
    
    const appStatus = await page.evaluate(() => {
      // Next.jsアプリケーションのroot要素を探す
      const nextRoot = document.getElementById('__next')
      const appRoot = document.querySelector('[data-reactroot]')
      
      return {
        hasNextRoot: !!nextRoot,
        hasReactRoot: !!appRoot,
        bodyHTML: document.body.innerHTML.substring(0, 200)
      }
    })
    
    console.log('アプリケーション状態:', JSON.stringify(appStatus, null, 2))
    
    // より詳細なエラーチェック
    const errors = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('[class*="error"], [id*="error"]')
      return Array.from(errorElements).map(el => ({
        class: el.className,
        id: el.id,
        text: el.textContent?.substring(0, 100)
      }))
    })
    
    if (errors.length > 0) {
      console.log('エラー要素:', JSON.stringify(errors, null, 2))
    }
  })
})