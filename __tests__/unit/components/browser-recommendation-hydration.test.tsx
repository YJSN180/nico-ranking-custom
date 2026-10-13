import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { BrowserRecommendationOnce } from '@/components/browser-recommendation-once'

// 推奨ブラウザのお知らせ（初回だけ出す）は、SSR では localStorage を読めないため「確認中（非表示）」で出し、
// ハイドレーション後に表示・非表示を決める。以前はテーマ Provider のゲートが子を作り直していたので
// 表示に切り替わっていたが、ゲートを外した後は SSR の class のまま残り、一度も表示されなくなっていた。
// （ゲートは LCP を悪化させるので戻さない。コンポーネント側でハイドレーションに対応する）

const KEY = 'browser-recommendation-dismissed'

describe('BrowserRecommendationOnce のハイドレーション', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    window.localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    container.remove()
  })

  async function hydrate() {
    container.innerHTML = renderToString(<BrowserRecommendationOnce />)
    const serverClass = container.querySelector('[role="alert"]')?.className
    await act(async () => {
      root = hydrateRoot(container, <BrowserRecommendationOnce />)
    })
    return { serverClass, clientClass: container.querySelector('[role="alert"]')?.className }
  }

  it('SSR は確認中（非表示）で出し、まだ閉じていなければハイドレーション後に表示する', async () => {
    const { serverClass, clientClass } = await hydrate()
    expect(serverClass).toBe('browser-recommendation browser-recommendation--checking')
    expect(clientClass).toBe('browser-recommendation')
  })

  it('一度閉じていれば、ハイドレーション後も非表示のまま', async () => {
    window.localStorage.setItem(KEY, 'true')
    const { clientClass } = await hydrate()
    expect(clientClass).toBe('browser-recommendation browser-recommendation--hidden')
  })
})
