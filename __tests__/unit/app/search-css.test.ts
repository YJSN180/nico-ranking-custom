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

/** @media (条件) { ... } の中身（最初の 1 つ）。無ければ null。入れ子の波かっこを数えて取り出す */
function mediaBody(condition: string): string | null {
  const start = css.indexOf(`@media ${condition} {`)
  if (start < 0) return null
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    if (depth === 0) return css.slice(css.indexOf('{', start) + 1, i)
  }
  return null
}

/** 中身の中で、セレクタ（カンマ区切りの一覧のどれか）に当たる規則の本体 */
function ruleIn(body: string, selector: string): string | null {
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((s) => s.trim())
    if (selectors.includes(selector)) return match[2] ?? ''
  }
  return null
}

const TOUCH = '(max-width: 640px), (pointer: coarse)'

describe('スマートフォン・タッチ操作の端末での入力欄と ✕', () => {
  it('入力欄と選択欄は 16px にする（iOS の Safari が 16px 未満の欄へのフォーカスで画面を拡大するため）', () => {
    const body = mediaBody(TOUCH)
    expect(body).not.toBeNull()
    for (const selector of ['.search-form__number', '.search-form__date', '.search-form__sort']) {
      expect(ruleIn(body ?? '', selector)).toMatch(/font-size:\s*16px/)
    }
    expect(ruleBody('.search-form__keyword')).toMatch(/font-size:\s*16px/)
  })

  it('適用中の条件の ✕ は、見た目を変えずにタップ領域を 44px 四方に広げ、隣のチップの領域と重ねない', () => {
    const body = mediaBody(TOUCH) ?? ''
    const area = ruleIn(body, '.search-results__chip button::after')
    expect(area).toMatch(/width:\s*44px/)
    expect(area).toMatch(/height:\s*44px/)
    expect(ruleIn(body, '.search-results__chip button')).toMatch(/position:\s*relative/)
    // チップの高さ（32px）と上下の間（12px）で 44px。✕ の領域は 44px なので上下の行と重ならない
    expect(ruleIn(body, '.search-results__chip')).toMatch(/min-height:\s*32px/)
    expect(ruleIn(body, '.search-results__chips')).toMatch(/gap:\s*12px/)
  })
})

describe('保存した検索のチップのフォーカス', () => {
  it('チップで中身を切り取らず（フォーカスのリングが切れる）、ボタンごとに角の丸いリングを出す', () => {
    expect(ruleBody('.search-form__saved-chip')).not.toMatch(/overflow:\s*hidden/)
    expect(ruleBody('.search-form__saved-load:focus-visible')).toMatch(/outline:\s*2px solid/)
    expect(ruleBody('.search-form__saved-delete:focus-visible')).toMatch(/outline:\s*2px solid/)
  })
})
