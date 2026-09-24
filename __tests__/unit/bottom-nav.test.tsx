import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomNav } from '@/components/bottom-nav'

// このファイル内でだけ pathname を差し替えられるようにする
let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn(), toString: vi.fn(() => '') })
}))

describe('BottomNav', () => {
  it('ホーム・検索・マイリスト・設定の4項目を表示する', () => {
    mockPathname = '/'
    render(<BottomNav />)
    expect(screen.getByText('ホーム')).toBeInTheDocument()
    expect(screen.getByText('検索')).toBeInTheDocument()
    expect(screen.getByText('マイリスト')).toBeInTheDocument()
    expect(screen.getByText('設定')).toBeInTheDocument()
  })

  it('現在のルートに対応する項目に aria-current が付く', () => {
    mockPathname = '/search'
    render(<BottomNav />)
    const active = screen.getByText('検索').closest('a')
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('ホーム').closest('a')).not.toHaveAttribute('aria-current')
  })

  it('設定ボタンで openSettings イベントを発火する', () => {
    mockPathname = '/'
    render(<BottomNav />)
    const listener = vi.fn()
    window.addEventListener('openSettings', listener)
    fireEvent.click(screen.getByTestId('bottom-nav-settings'))
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('openSettings', listener)
  })

  it('管理画面では表示しない', () => {
    mockPathname = '/admin/ng-settings'
    const { container } = render(<BottomNav />)
    expect(container.querySelector('.bottom-nav')).toBeNull()
  })
})
