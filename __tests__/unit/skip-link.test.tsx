import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import { HeaderWithSettings } from '@/components/header-with-settings'

// スキップリンク（app/layout.tsx の「本文へスキップ」）は、ヘッダーのナビを飛ばして本文へ移る。
// 以前の飛び先 <main id="main-content"> はヘッダーを内側に含むため、移ったあとの Tab が
// ヘッダーのメニューボタンに当たり、何も飛ばせていなかった（/mylists/[id] には飛び先自体が無い）。

function skipLinkTargetId(): string {
  const layout = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf-8')
  const match = layout.match(/<a href="#([^"]+)" className="skip-link"/)
  return match?.[1] ?? ''
}

describe('スキップリンクの飛び先', () => {
  it('ヘッダーの直後（ヘッダーの外）にあり、フォーカスを受け取れる', () => {
    const id = skipLinkTargetId()
    expect(id).not.toBe('')

    const { container } = render(
      <main id="main-content">
        <HeaderWithSettings />
        <div>
          <button type="button">本文の最初の操作</button>
        </div>
      </main>
    )
    const header = container.querySelector('header')
    const target = document.getElementById(id)

    expect(header).not.toBeNull()
    expect(target).not.toBeNull()
    expect(header?.contains(target)).toBe(false)
    // ヘッダーより後
    expect(header!.compareDocumentPosition(target!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 本文の最初の操作より前
    const firstContentControl = container.querySelector('main > div > button') as HTMLElement
    expect(target!.compareDocumentPosition(firstContentControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // tabIndex=-1: Tab 順には入らないが、リンクで移るとフォーカスが移り、次の Tab は本文から始まる
    expect(target!.tabIndex).toBe(-1)
    target!.focus()
    expect(document.activeElement).toBe(target)
  })
})
