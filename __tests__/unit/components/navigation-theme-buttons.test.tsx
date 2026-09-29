import React from 'react'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect } from 'vitest'
import { Navigation } from '@/components/navigation'

// ドロワーのテーマ切り替えボタンは絵文字（☀️ 🌙 🌌）だけで、名前も選択中かどうかも
// 読み上げられなかった。設定モーダルと同じ呼び名を付け、選択中を aria-pressed で伝える。

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'dark' },
    updatePreferences: vi.fn(),
  }),
}))

describe('ドロワーのテーマ切り替えボタン', () => {
  it('テーマの名前で読み上げ、選択中のものは押された状態になる', () => {
    render(<Navigation />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    const drawer = document.getElementById('navigation-menu') as HTMLElement

    const light = within(drawer).getByRole('button', { name: 'ライトモード' })
    const dark = within(drawer).getByRole('button', { name: 'ダークモード' })
    const darkblue = within(drawer).getByRole('button', { name: 'ダークブルー' })

    expect(light).toHaveAttribute('aria-pressed', 'false')
    expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(darkblue).toHaveAttribute('aria-pressed', 'false')
    // 見た目は絵文字のまま
    expect(dark.textContent?.trim()).toBe('🌙')
  })
})
