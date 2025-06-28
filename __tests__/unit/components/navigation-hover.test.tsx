import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Navigation } from '@/components/navigation'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

// Mock hooks
vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false,
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn(),
  }),
}))

describe('Navigation - メニューボタンホバー', () => {
  it('メニューボタンのホバー時にボタン自体のみがスケールされる', () => {
    render(<Navigation />)
    
    const menuButton = screen.getByRole('button', { name: 'メニュー' })
    
    // ホバー前の状態を確認
    expect(menuButton.style.backgroundColor).toBe('rgba(255, 255, 255, 0.25)')
    
    // ホバーイベントを発火
    fireEvent.mouseEnter(menuButton)
    
    // ボタンの背景色が変わることを確認
    expect(menuButton.style.backgroundColor).toBe('rgba(255, 255, 255, 0.35)')
    
    // 親要素がスケールされないことを確認（修正後）
    const parentElement = menuButton.parentElement
    expect(parentElement?.style.transform).not.toContain('scale')
  })

  it('メニューが開いている時、ドロップダウンはホバーの影響を受けない', () => {
    render(<Navigation />)
    
    const menuButton = screen.getByRole('button', { name: 'メニュー' })
    
    // メニューを開く
    fireEvent.click(menuButton)
    
    // ドロップダウンが表示される
    const dropdown = screen.getByRole('navigation')
    const initialTransform = dropdown.style.transform || ''
    
    // ボタンにホバー
    fireEvent.mouseEnter(menuButton)
    
    // ドロップダウンのtransformが変わらないことを確認
    expect(dropdown.style.transform).toBe(initialTransform)
  })
})