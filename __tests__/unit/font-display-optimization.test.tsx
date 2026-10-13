import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('フォント読み込み最適化', () => {
  it('ロゴ用フォントはサブセット版(woff2のみ)を font-display:swap で読み込む', () => {
    // layout.tsxファイルの内容を読み込む
    const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx')
    const layoutContent = fs.readFileSync(layoutPath, 'utf-8')

    // ロゴ文字だけにサブセット化した ~2KB のフォントなので、FOIT を避ける swap を使う
    const nicomijiRegex = /@font-face\{font-family:'Nicomoji Plus v2';src:url\('\/fonts\/nicomoji-plus-v2-logo\.woff2'\) format\('woff2'\)[^}]+font-display:swap/
    const comicSansRegex = /@font-face\{font-family:'Comic Sans MS Bold';src:url\('\/fonts\/comic-sans-ms-bold-logo\.woff2'\) format\('woff2'\)[^}]+font-display:swap/
    expect(layoutContent).toMatch(nicomijiRegex)
    expect(layoutContent).toMatch(comicSansRegex)

    // 1.1MB の元フォント / TTF フォールバックを参照していないこと
    expect(layoutContent).not.toContain('nicomoji-plus-v2.woff2')
    expect(layoutContent).not.toContain("format('truetype')")
    // サブセットフォントは実在すること
    expect(fs.existsSync(path.join(process.cwd(), 'public', 'fonts', 'nicomoji-plus-v2-logo.woff2'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'public', 'fonts', 'comic-sans-ms-bold-logo.woff2'))).toBe(true)
  })

  it('header.module.cssでもfont-display:fallbackが設定されている', () => {
    // header.module.cssファイルの内容を読み込む
    const cssPath = path.join(process.cwd(), 'components', 'header.module.css')
    const cssContent = fs.readFileSync(cssPath, 'utf-8')
    
    // font-display: fallbackが使われていることを確認
    expect(cssContent).toContain('font-display: fallback')
  })
})