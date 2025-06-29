import React from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { Navigation } from '@/components/navigation'

// Next.js routerのモック
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

// window.matchMediaのモック
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// User preferencesのモック
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn(),
  }),
}))

describe('Navigation hydration test', () => {
  it('モバイルナビゲーションをレンダリングすべき', () => {
    const { container } = render(<Navigation />)
    
    // メニューボタンが存在することを確認
    const menuButton = container.querySelector('button[aria-label="メニュー"]')
    
    expect(menuButton).toBeInTheDocument()
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton).toHaveAttribute('aria-controls', 'navigation-menu')
  })
  
  it('SSR安全な方法でレンダリングされるべき', () => {
    const { container } = render(<Navigation />)
    
    // ナビゲーションコンテナが存在することを確認
    const navContainer = container.firstChild
    
    expect(navContainer).toBeInTheDocument()
    expect(navContainer).toHaveStyle('opacity: 0') // 初期状態では透明
  })
})