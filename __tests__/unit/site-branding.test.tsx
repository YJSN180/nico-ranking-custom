import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeaderWithSettings } from '@/components/header-with-settings'

describe('サイトブランディング', () => {
  it('サイト名が「ニコニコランキング(Re:turn)」と表示される', () => {
    render(<HeaderWithSettings />)
    
    expect(screen.getByText('ニコニコランキング(Re:turn)')).toBeInTheDocument()
  })

  it('サブタイトルは削除された', () => {
    render(<HeaderWithSettings />)
    
    // 副題は削除されたため表示されない
    expect(screen.queryByText('最新の人気動画をリアルタイムで')).not.toBeInTheDocument()
  })

  it('ヘッダーの高さがモバイルサイズで適切', () => {
    render(<HeaderWithSettings />)
    
    const header = screen.getByRole('banner')
    const styles = window.getComputedStyle(header)
    
    // paddingを考慮した実効高さをチェック
    expect(styles.padding).toMatch(/20px|1.25rem/)
  })
})