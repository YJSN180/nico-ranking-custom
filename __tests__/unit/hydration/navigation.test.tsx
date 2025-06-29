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

// User preferencesのモック
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn(),
  }),
}))

describe('Navigation hydration test', () => {
  it('モバイルとデスクトップ両方のバージョンをレンダリングすべき', () => {
    const { container } = render(<Navigation />)
    
    // モバイル版とデスクトップ版の両方が存在することを確認
    const mobileOnly = container.querySelector('.mobile-only')
    const desktopOnly = container.querySelector('.desktop-only')
    
    expect(mobileOnly).toBeInTheDocument()
    expect(desktopOnly).toBeInTheDocument()
  })
  
  it('CSS Media Queriesで表示制御されるべき', () => {
    const { container } = render(<Navigation />)
    
    // CSSクラスが正しく適用されているか確認
    const mobileOnly = container.querySelector('.mobile-only')
    const desktopOnly = container.querySelector('.desktop-only')
    
    // クラスが存在することを確認（実際の表示/非表示はCSSで制御）
    expect(mobileOnly).toHaveClass('mobile-only')
    expect(desktopOnly).toHaveClass('desktop-only')
  })
})