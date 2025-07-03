import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('フォント読み込み最適化', () => {
  it('font-displayがoptionalに設定されている', () => {
    // layout.tsxファイルの内容を読み込む
    const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx')
    const layoutContent = fs.readFileSync(layoutPath, 'utf-8')
    
    // font-display: swapが使われていないことを確認
    expect(layoutContent).not.toContain('font-display:swap')
    
    // font-display: optionalが使われていることを確認
    expect(layoutContent).toContain('font-display:optional')
    
    // 特定のフォントで確認
    const nicomijiRegex = /@font-face\{font-family:'Nicomoji Plus v2'[^}]+font-display:optional/
    const comicSansRegex = /@font-face\{font-family:'Comic Sans MS Bold'[^}]+font-display:optional/
    
    expect(layoutContent).toMatch(nicomijiRegex)
    expect(layoutContent).toMatch(comicSansRegex)
    
    // Google Fontsのdisplay設定も確認
    expect(layoutContent).toContain("display: 'optional'")
  })

  it('header.module.cssでもfont-display:fallbackが設定されている', () => {
    // header.module.cssファイルの内容を読み込む
    const cssPath = path.join(process.cwd(), 'components', 'header.module.css')
    const cssContent = fs.readFileSync(cssPath, 'utf-8')
    
    // font-display: fallbackが使われていることを確認
    expect(cssContent).toContain('font-display: fallback')
  })
})