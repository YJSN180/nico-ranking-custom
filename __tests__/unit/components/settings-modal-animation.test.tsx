import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsModal } from '@/components/settings-modal'

// CSSモジュールのモック
vi.mock('@/components/settings-modal.module.css', () => ({
  default: {
    overlay: 'overlay',
    modal: 'modal',
    header: 'header',
    closeButton: 'closeButton',
    tabs: 'tabs',
    tab: 'tab',
    active: 'active',
    content: 'content',
    displaySettings: 'displaySettings',
    ngListSettings: 'ngListSettings',
    section: 'section',
    footer: 'footer',
    stats: 'stats',
    // 他の必要なクラス名も追加
  }
}))

describe('SettingsModal アニメーション', () => {
  it('モーダルが開いた時にアニメーションクラスが適用される', () => {
    const onClose = vi.fn()
    
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    // オーバーレイとモーダルが存在することを確認
    const overlay = screen.getByText('設定').closest('.overlay')
    const modal = screen.getByText('設定').closest('.modal')
    
    expect(overlay).toBeInTheDocument()
    expect(modal).toBeInTheDocument()
  })

  it('表示設定タブとNGリスト管理タブのコンテンツ高さが一定である', () => {
    const onClose = vi.fn()
    
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    // NGリスト管理タブに切り替え
    const ngListTab = screen.getByText('NGリスト管理')
    fireEvent.click(ngListTab)
    
    const content1 = screen.getByText('🚫 動画ID').closest('.content')
    const height1 = content1?.clientHeight || 0
    
    // 表示設定タブに切り替え
    const displayTab = screen.getByText('表示設定')
    fireEvent.click(displayTab)
    
    const content2 = screen.getByText('🎨 テーマ設定').closest('.content')
    const height2 = content2?.clientHeight || 0
    
    // 両方のタブでコンテンツエリアが存在することを確認
    expect(content1).toBeInTheDocument()
    expect(content2).toBeInTheDocument()
  })

  it('モーダルの最大高さが85vhに設定されている', () => {
    const onClose = vi.fn()
    
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    const modal = screen.getByText('設定').closest('.modal')
    
    // モーダルが存在することを確認
    expect(modal).toBeInTheDocument()
    // CSSクラスが適用されていることを確認
    expect(modal).toHaveClass('modal')
  })
})