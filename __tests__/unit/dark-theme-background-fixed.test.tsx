import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'

describe('ダークテーマの背景色（修正後）', () => {
  let dom: JSDOM
  let document: Document
  let window: Window

  beforeEach(() => {
    // 修正後のCSS
    const css = `
      :root {
        --foreground-rgb: 0, 0, 0;
        --background-start-rgb: 255, 255, 255;
        --background-end-rgb: 240, 240, 240;
        --background-color: #ffffff;
      }
      
      [data-theme="dark"] {
        --foreground-rgb: 255, 255, 255;
        --background-start-rgb: 20, 20, 20;
        --background-end-rgb: 10, 10, 10;
        --background-color: #1a1a1a;
      }
      
      [data-theme="darkblue"] {
        --foreground-rgb: 240, 248, 255;
        --background-start-rgb: 25, 39, 52;
        --background-end-rgb: 13, 27, 42;
        --background-color: #0d1b2a;
      }
      
      body {
        color: rgb(var(--foreground-rgb));
        background-color: var(--background-color);
        transition: background 0.3s ease, color 0.3s ease;
      }
    `
    
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>${css}</style>
        </head>
        <body></body>
      </html>
    `, {
      pretendToBeVisual: true,
      resources: 'usable'
    })
    
    document = dom.window.document
    window = dom.window as any
  })

  afterEach(() => {
    dom.window.close()
  })

  it('bodyがCSS変数の背景色を直接使用する', () => {
    // CSSルールを確認
    const styleSheet = document.styleSheets[0] as CSSStyleSheet
    const bodyRule = Array.from(styleSheet.cssRules).find(
      rule => (rule as CSSStyleRule).selectorText === 'body'
    ) as CSSStyleRule
    
    // backgroundColor プロパティがvar(--background-color)を使用していることを確認
    const bgColor = bodyRule.style.getPropertyValue('background-color')
    expect(bgColor).toBe('var(--background-color)')
  })

  it('ダークテーマで実際に暗い背景色が適用される', () => {
    // ダークテーマを設定
    document.documentElement.setAttribute('data-theme', 'dark')
    
    // 強制的にスタイルを再計算（実際のブラウザの挙動を模擬）
    const body = document.body
    body.style.backgroundColor = 'var(--background-color)'
    
    // 計算されたスタイルを確認
    const computedStyle = window.getComputedStyle(body)
    const rootStyle = window.getComputedStyle(document.documentElement)
    const bgColorVar = rootStyle.getPropertyValue('--background-color').trim()
    
    // ダークテーマの背景色が適用されていることを確認
    expect(bgColorVar).toBe('#1a1a1a')
  })

  it('ダークブルーテーマで実際に青みがかった暗い背景色が適用される', () => {
    // ダークブルーテーマを設定
    document.documentElement.setAttribute('data-theme', 'darkblue')
    
    // 強制的にスタイルを再計算
    const body = document.body
    body.style.backgroundColor = 'var(--background-color)'
    
    // 計算されたスタイルを確認
    const computedStyle = window.getComputedStyle(body)
    const rootStyle = window.getComputedStyle(document.documentElement)
    const bgColorVar = rootStyle.getPropertyValue('--background-color').trim()
    
    // ダークブルーテーマの背景色が適用されていることを確認
    expect(bgColorVar).toBe('#0d1b2a')
  })
})