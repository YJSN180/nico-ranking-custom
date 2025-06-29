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
    
    // Tailwindクラスを使用したモバイル版とデスクトップ版の両方が存在することを確認
    const mobileVersion = container.querySelector('.sm\\:hidden')  // モバイル版（640px未満）
    const desktopVersion = container.querySelector('.hidden.sm\\:block')  // デスクトップ版（640px以上）
    
    expect(mobileVersion).toBeInTheDocument()
    expect(desktopVersion).toBeInTheDocument()
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