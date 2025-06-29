// このデバッグ用E2Eテストは削除されました。
// 理由：単体テストでカバーできない実際のユーザージャーニーをテストすべきです。
// HTML構造の確認は単体テストや統合テストで十分カバー可能です。

/*
import { test, expect } from '@playwright/test'

test.describe('HTML構造の確認', () => {
  test('設定ボタンとその周辺のHTML構造を確認', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // ヘッダー全体のHTMLを取得
    const headerHTML = await page.evaluate(() => {
      const header = document.querySelector('header')
      return header ? header.outerHTML : 'Header not found'
    })
    
    console.log('ヘッダーのHTML:')
    console.log(headerHTML.substring(0, 1000) + '...')
    
    // Reactコンポーネントがハイドレートされているか確認
    const isHydrated = await page.evaluate(() => {
      // React Fiberノードを確認
      const button = document.querySelector('button[aria-label="設定"]')
      if (!button) return false
      
      // React内部プロパティを確認
      const keys = Object.keys(button)
      const reactKeys = keys.filter(key => key.startsWith('__react'))
      const hasReactFiber = reactKeys.length > 0
      
      // イベントリスナーの確認
      const events = (button as any)._events || {}
      const hasClickEvent = 'click' in events
      
      return {
        hasReactFiber,
        reactKeys,
        hasClickEvent,
        buttonExists: true
      }
    })
    
    console.log('ハイドレーション状態:', JSON.stringify(isHydrated, null, 2))
    
    // 実際にボタンがクリック可能か確認
    const button = page.locator('button[aria-label="設定"]')
    const isClickable = await button.isEnabled()
    const isVisible = await button.isVisible()
    
    console.log('ボタンの状態:')
    console.log('- 有効:', isClickable)
    console.log('- 表示:', isVisible)
    
    // ボタンのスタイルを確認
    const buttonStyles = await button.evaluate(el => {
      const computed = window.getComputedStyle(el)
      return {
        display: computed.display,
        visibility: computed.visibility,
        pointerEvents: computed.pointerEvents,
        position: computed.position,
        zIndex: computed.zIndex
      }
    })
    
    console.log('ボタンのスタイル:', JSON.stringify(buttonStyles, null, 2))
    
    // Next.jsのハイドレーションマーカーを確認
    const hasHydrationMarkers = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'))
      const hasNextData = scripts.some(s => s.id === '__NEXT_DATA__')
      const hasNextScripts = scripts.some(s => s.src && s.src.includes('/_next/'))
      
      return {
        hasNextData,
        hasNextScripts,
        scriptCount: scripts.length
      }
    })
    
    console.log('Next.jsマーカー:', JSON.stringify(hasHydrationMarkers, null, 2))
    
    // エラーを確認
    const errors = await page.evaluate(() => {
      return (window as any).__NEXT_DATA__?.err || null
    })
    
    if (errors) {
      console.log('Next.jsエラー:', errors)
    }
  })
})
*/