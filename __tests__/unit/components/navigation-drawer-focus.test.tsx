import React from 'react'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Navigation } from '@/components/navigation'

// モバイル幅（768px 以下）のドロワーは body の末尾へ portal で描画する。キーボードで開いても
// フォーカスはメニューボタンに残り、Tab は暗い覆いの後ろのヘッダー（ロゴ・設定）へ進んで、
// ドロワーの項目にはページ全体を Tab で送らないと届かなかった（幅を狭めた本番ビルドで確認）。

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn(),
  }),
}))

const originalMatchMedia = window.matchMedia

function mockViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && (query === '(max-width: 640px)' || query === '(max-width: 768px)'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function drawer(): HTMLElement {
  const el = document.getElementById('navigation-menu')
  if (!el) throw new Error('drawer is not open')
  return el
}

function openWithKeyboard() {
  const trigger = screen.getByRole('button', { name: 'メニューを開く' })
  trigger.focus()
  // キーボード（Enter / Space）で押したときの click は detail が 0
  fireEvent.click(trigger, { detail: 0 })
  return trigger
}

describe('モバイルのドロワー: キーボードのフォーカス', () => {
  beforeEach(() => {
    // 閉じるアニメーション（モバイル幅）を待たずに確かめるため、PC 幅の判定にしておく。
    // ドロワー（portal）自体は幅に関係なく開いている間は描画される
    mockViewport(false)
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('キーボードで開くと、ドロワーの最初の操作にフォーカスが移る', () => {
    render(<Navigation />)
    openWithKeyboard()
    const first = within(drawer()).getAllByRole('button')[0]
    expect(document.activeElement).toBe(first)
  })

  it('タップやクリックで開いたときはフォーカスを動かさない', () => {
    render(<Navigation />)
    const trigger = screen.getByRole('button', { name: 'メニューを開く' })
    trigger.focus()
    fireEvent.click(trigger, { detail: 1 })
    expect(document.getElementById('navigation-menu')).not.toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('ドロワーの中の Tab / Shift+Tab は、端で反対側へ回る（覆いの後ろへ出ない）', () => {
    render(<Navigation />)
    openWithKeyboard()
    const nav = drawer()
    const focusables = Array.from(nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('ドロワーの閉じるボタンで閉じると、フォーカスはメニューボタンへ戻る', () => {
    render(<Navigation />)
    const trigger = openWithKeyboard()
    const close = within(drawer()).getByRole('button', { name: 'メニューを閉じる' })
    close.focus()
    fireEvent.click(close)
    expect(document.getElementById('navigation-menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
