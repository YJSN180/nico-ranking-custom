// 検索ページの CSS のうち、キーボード・読み上げの操作性に関わる規則を確かめる（U-c）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.join(process.cwd(), 'app/search/search.css'), 'utf-8')

/** セレクタにちょうど一致する規則の本体（最初の 1 つ）。無ければ null */
function ruleBody(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null
}

describe('検索ページのジャンル選択（U-c）', () => {
  it('チェックボックスは見た目だけ隠し、フォーカスと読み上げの対象に残す', () => {
    const input = ruleBody('.search-form__genre input')
    expect(input).not.toBeNull()
    expect(input).not.toMatch(/display:\s*none/)
    expect(input).toMatch(/opacity:\s*0/)
    expect(ruleBody('.search-form__genre')).toMatch(/position:\s*relative/)
  })

  it('キーボードで選んだジャンルにフォーカスのリングを出す', () => {
    expect(ruleBody('.search-form__genre:has(input:focus-visible)')).toMatch(/outline:\s*2px solid/)
  })
})
