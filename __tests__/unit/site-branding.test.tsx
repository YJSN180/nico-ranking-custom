import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeaderWithSettings } from '@/components/header-with-settings'

describe('サイトブランディング', () => {
  it('サイト名が「ニコラン(Re:turn)」と表示される', () => {
    render(<HeaderWithSettings />)
    
    expect(screen.getByText('ニコラン')).toBeInTheDocument()
    expect(screen.getByText('(Re:turn)')).toBeInTheDocument()
  })

  it('サブタイトルは削除された', () => {
    render(<HeaderWithSettings />)
    
    // 副題は削除されたため表示されない
    expect(screen.queryByText('最新の人気動画をリアルタイムで')).not.toBeInTheDocument()
  })

  it('ヘッダーの高さがモバイルサイズで適切', () => {
    render(<HeaderWithSettings />)
    
    const header = screen.getByRole('banner')
    
    // CSS modulesがテスト環境で正しく読み込まれることを確認
    // headerResponsiveクラスが適用されていることを確認
    expect(header.className).toContain('headerResponsive')
  })
})