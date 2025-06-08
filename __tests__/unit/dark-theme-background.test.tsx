import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'

describe('ダークテーマの背景色', () => {
  let dom: JSDOM
  let document: Document
  let window: Window

  beforeEach(() => {
    // globals.cssの実際の内容を模擬
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
        color: var(--text-primary);
        background: linear-gradient(
            to bottom,
            transparent,
            rgb(var(--background-end-rgb))
          )
          rgb(var(--background-start-rgb));
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

  it('ライトテーマで背景が白になる', () => {
    const body = document.body
    const computedStyle = window.getComputedStyle(body)
    
    // CSS変数から背景色を取得
    const rootStyle = window.getComputedStyle(document.documentElement)
    const backgroundColor = rootStyle.getPropertyValue('--background-color').trim()
    
    expect(backgroundColor).toBe('#ffffff')
  })

  it('ダークテーマで背景が暗い色になる', () => {
    // data-themeを設定
    document.documentElement.setAttribute('data-theme', 'dark')
    
    // CSS変数から背景色を取得
    const rootStyle = window.getComputedStyle(document.documentElement)
    const backgroundColor = rootStyle.getPropertyValue('--background-color').trim()
    
    expect(backgroundColor).toBe('#1a1a1a')
  })

  it('ダークブルーテーマで背景が青みがかった暗い色になる', () => {
    // data-themeを設定
    document.documentElement.setAttribute('data-theme', 'darkblue')
    
    // CSS変数から背景色を取得
    const rootStyle = window.getComputedStyle(document.documentElement)
    const backgroundColor = rootStyle.getPropertyValue('--background-color').trim()
    
    expect(backgroundColor).toBe('#0d1b2a')
  })

  it('bodyがCSS変数の背景色を使用していない（現在の問題）', () => {
    // ダークテーマを設定
    document.documentElement.setAttribute('data-theme', 'dark')
    
    // bodyのスタイルを確認
    const body = document.body
    const computedStyle = window.getComputedStyle(body)
    const background = computedStyle.background
    
    // 現在の実装では、var(--background-color)を使用していない
    expect(background).not.toContain('var(--background-color)')
    // 代わりにRGBベースのグラデーションを使用している
    expect(background).toContain('rgb(')
  })
})