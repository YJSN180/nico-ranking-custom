import React from 'react'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Navigation } from '@/components/navigation'
import { SettingsModal } from '@/components/settings-modal'

// X-a の修正（overflow-x: clip）で sticky ヘッダーが効くようになった。
// ドロワーや設定モーダルの背景スクロール止めを body の overflow: hidden で行うと、
// body がスクロールコンテナになって sticky が外れ、開いた瞬間にヘッダーが消える
// （しかも html が overflow を持つため、body の hidden ではスクロール自体も止まらない）。
// スクロール止めはビューポートに効く html（documentElement）で行う。PC は main と同じく止めない。

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

describe('背景スクロールの止め方（sticky ヘッダーを壊さない）', () => {
  beforeEach(() => {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  })

  it('モバイルでドロワーを開くと html を止め、body には overflow を付けない。閉じたら戻す', async () => {
    mockViewport(375)
    render(<Navigation />)

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('')

    fireEvent.click(within(document.getElementById('navigation-menu') as HTMLElement).getByRole('button', { name: 'メニューを閉じる' }))
    await waitFor(() => expect(document.getElementById('navigation-menu')).toBeNull())
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('モバイルで設定モーダルを開くと html を止め、閉じたら戻す', () => {
    mockViewport(375)
    const { unmount } = render(<SettingsModal isOpen={true} onClose={vi.fn()} />)
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('')

    unmount()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('PC では設定モーダルを開いても背景スクロールを止めない（main と同じ）', () => {
    mockViewport(1280)
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />)
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
  })
})

describe('lockViewportScroll（重なったロック）', () => {
  afterEach(() => {
    document.documentElement.style.overflow = ''
  })

  it('ドロワーから設定モーダルを開いたように重なっても、最後の解除で元に戻す（hidden のまま残らない）', async () => {
    const { lockViewportScroll } = await import('@/lib/scroll-lock')
    const releaseDrawer = lockViewportScroll()
    const releaseModal = lockViewportScroll()
    // ドロワーの退場アニメーションが先に終わる
    releaseDrawer()
    expect(document.documentElement.style.overflow).toBe('hidden')
    releaseModal()
    expect(document.documentElement.style.overflow).toBe('')
    // 二重解除しても数がずれない
    releaseModal()
    const again = lockViewportScroll()
    expect(document.documentElement.style.overflow).toBe('hidden')
    again()
    expect(document.documentElement.style.overflow).toBe('')
  })
})
