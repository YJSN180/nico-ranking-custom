import React from 'react'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { Navigation } from '@/components/navigation'

// PC（769px 以上）のドロップダウンは main と同じく、閉じたら即座に消す（退場アニメーションなし）。
// モバイルのドロワーは退場アニメーション（180ms）を残す。

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn(),
  }),
}))

const originalMatchMedia = window.matchMedia

function mockViewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const max = query.match(/max-width:\s*(\d+)px/)
    const min = query.match(/min-width:\s*(\d+)px/)
    const matches = max ? width <= Number(max[1]) : min ? width >= Number(min[1]) : false
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
  }) as unknown as typeof window.matchMedia
}

describe('ナビゲーションの閉じ方', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('PC のドロップダウンは閉じたら即座に消える（main と同じ）', () => {
    mockViewport(1280)
    render(<Navigation />)

    fireEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    expect(document.getElementById('navigation-dropdown')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.getElementById('navigation-dropdown')).toBeNull()
  })

  it('PC のドロップダウンの外側をクリックしても即座に消える', () => {
    mockViewport(1280)
    render(<Navigation />)

    fireEvent.click(screen.getByRole('button', { name: 'メニュー' }))
    fireEvent.mouseDown(document.body)
    expect(document.getElementById('navigation-dropdown')).toBeNull()
  })

  it('モバイルのドロワーは退場アニメーションの後に消える', async () => {
    mockViewport(375)
    render(<Navigation />)

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    const drawer = document.getElementById('navigation-menu') as HTMLElement
    fireEvent.click(within(drawer).getByRole('button', { name: 'メニューを閉じる' }))

    // 直後はまだ残り、退場アニメーション用のクラスが付く
    expect(document.getElementById('navigation-menu')?.className).toMatch(/drawerClosing/)
    await waitFor(() => expect(document.getElementById('navigation-menu')).toBeNull())
  })
})
