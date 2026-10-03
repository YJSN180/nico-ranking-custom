import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// X-a: html・body・main の `overflow-x: hidden` はそれぞれをスクロールコンテナにしてしまい、
// その中の position: sticky（モバイルのヘッダー）がビューポートに追従しなくなる。
// 横スクロール防止は、スクロールコンテナを作らない `overflow-x: clip` で行う。

const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf-8')

function blockOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`globals.css に ${selector} のルールが無い`)
  return match[1]
}

describe('globals.css: 横スクロール防止は overflow-x: clip（sticky を壊さない）', () => {
  it.each(['html', 'body', '.container, main, body > div'])('%s は overflow-x: clip を使う', (selector) => {
    const block = blockOf(selector)
    expect(block).toMatch(/overflow-x:\s*clip\s*;/)
    expect(block).not.toMatch(/overflow-x:\s*(hidden|auto|scroll)\s*;/)
  })
})
