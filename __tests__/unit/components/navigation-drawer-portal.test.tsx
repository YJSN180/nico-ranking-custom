import React from 'react'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { HeaderWithSettings } from '@/components/header-with-settings'

// X-b: モバイルのドロワー（とオーバーレイ）がヘッダーの中に描画されていたため、
// - ヘッダー（sticky, z-index 20）の重なりの中に閉じ込められ、ボトムナビ（25）が上に残る
// - ヘッダーを隠す transform がドロワーの基準になり、ヘッダーが隠れるとドロワーごと消える
// ドロワーとオーバーレイは body 直下へ portal で描画し、開いている間はヘッダーを隠さない。

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn(),
  }),
}))

const originalMatchMedia = window.matchMedia

function mockMobileViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(max-width: 640px)' || query === '(max-width: 768px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

async function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true })
  fireEvent.scroll(window)
  // ヘッダーの判定は requestAnimationFrame の中で行う
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

describe('モバイルのドロワー（portal）とヘッダー', () => {
  beforeEach(async () => {
    mockMobileViewport()
    await scrollTo(0)
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('ドロワーとオーバーレイはヘッダーの外（body 直下）に描画する', async () => {
    render(<HeaderWithSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))

    const drawer = await waitFor(() => {
      const el = document.getElementById('navigation-menu')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    const header = screen.getByRole('banner')
    const overlay = screen.getByRole('button', { name: 'メニューを閉じる（背景をタップ）' })

    expect(header.contains(drawer)).toBe(false)
    expect(header.contains(overlay)).toBe(false)
    // body の子（モバイル幅だけ表示するラッパー）の中にある
    expect(drawer.parentElement?.parentElement).toBe(document.body)
    expect(overlay.parentElement?.parentElement).toBe(document.body)
  })

  it('ドロワーを開いている間は、下へスクロールしてもヘッダーを隠さない', async () => {
    render(<HeaderWithSettings />)
    const header = screen.getByRole('banner')

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    await scrollTo(400)
    await scrollTo(900)
    expect(header.getAttribute('data-hidden')).toBeNull()
  })

  it('ドロワーを閉じた後は、これまでどおり下スクロールで隠れる', async () => {
    render(<HeaderWithSettings />)
    const header = screen.getByRole('banner')

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    fireEvent.click(within(document.getElementById('navigation-menu') as HTMLElement).getByRole('button', { name: 'メニューを閉じる' }))
    // 退場アニメーション（180ms）の後にドロワーが外れる
    await waitFor(() => expect(document.getElementById('navigation-menu')).toBeNull())

    await scrollTo(400)
    await scrollTo(900)
    expect(header.getAttribute('data-hidden')).toBe('true')
  })
})
