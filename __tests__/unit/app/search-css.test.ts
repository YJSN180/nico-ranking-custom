// 検索ページの CSS のうち、キーボード・読み上げの操作性に関わる規則を確かめる（U-c）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (file: string): string => readFileSync(path.join(process.cwd(), file), 'utf-8')
const css = read('app/search/search.css')

/** セレクタにちょうど一致する規則の本体（最初の 1 つ）。無ければ null */
function ruleBody(selector: string, source = css): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null
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

/** @media (条件) { ... } の中身。同じ条件の塊が複数あればつないで返す。無ければ null。入れ子の波かっこを数えて取り出す */
function mediaBody(condition: string, source = css): string | null {
  const bodies: string[] = []
  let from = 0
  for (let start = source.indexOf(`@media ${condition} {`); start >= 0; start = source.indexOf(`@media ${condition} {`, from)) {
    const open = source.indexOf('{', start)
    let depth = 0
    let end = source.length
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      if (source[i] === '}') depth--
      if (depth === 0) {
        end = i
        break
      }
    }
    bodies.push(source.slice(open + 1, end))
    from = end
  }
  return bodies.length > 0 ? bodies.join('\n') : null
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

/** 中身の中で、セレクタの文字列が語をすべて含む規則の本体（:is() の中のカンマで切らないため、空白を除いて比べる） */
function ruleContaining(body: string, parts: string[]): string | null {
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = (match[1] ?? '').replace(/\s+/g, '')
    if (parts.every((part) => selector.includes(part.replace(/\s+/g, '')))) return match[2] ?? ''
  }
  return null
}

const TOUCH = '(max-width: 640px), (pointer: coarse)'

describe('スマートフォン・タブレット（タッチ操作）での入力欄', () => {
  it('入力欄と選択欄は 16px にする（iOS の Safari が 16px 未満の欄へのフォーカスで画面を拡大するため）', () => {
    const body = mediaBody(TOUCH)
    expect(body).not.toBeNull()
    const controls = ruleContaining(body ?? '', [
      '.search-form',
      "input[type='search']",
      "input[type='text']",
      "input[type='date']",
      "input[type='number']",
      'select',
    ])
    expect(controls).toMatch(/font-size:\s*16px/)
  })

  it('主検索欄は端末によらず 16px（入力欄の共通規則 .search-form :is(input[type=…]) より強いセレクタで指定する）', () => {
    expect(ruleBody('.search-form input.search-form__keyword-input')).toMatch(/font-size:\s*16px/)
  })

  it('条件で入力の欄も、幅の広いタブレットを含むタッチ操作の端末で 16px にする', () => {
    const body = mediaBody(TOUCH, read('components/keyword-condition-editor.module.css'))
    expect(ruleIn(body ?? '', '.editor .add .input')).toMatch(/font-size:\s*16px/)
  })
})

describe('保存した検索のチップのフォーカス（履歴・保存のパネル）', () => {
  const panel = read('components/search-library-panel.module.css')

  it('チップで中身を切り取らず（フォーカスのリングが切れる）、フォームの外に出ても、ボタンごとに角の丸いリングを出す', () => {
    expect(ruleBody('.savedChip', panel)).not.toMatch(/overflow:\s*hidden/)
    expect(ruleBody('.panel :is(button, input):focus-visible', panel)).toMatch(/outline:\s*2px solid/)
    expect(ruleBody('.panel .savedRun', panel)).toMatch(/border-radius:\s*999px/)
    expect(ruleBody('.panel .savedRemove', panel)).toMatch(/border-radius:\s*999px/)
  })

  it('タッチ操作の端末では、削除の ✕ と操作のボタンを押しやすい大きさにする', () => {
    const body = mediaBody(TOUCH, panel) ?? ''
    expect(ruleIn(body, '.panel .savedRemove')).toMatch(/width:\s*36px/)
    expect(ruleIn(body, '.panel .textButton')).toMatch(/min-height:\s*44px/)
  })
})
