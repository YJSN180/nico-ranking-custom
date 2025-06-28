import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BackLink } from '@/components/back-link'

describe('BackLink', () => {
  it('デフォルトでトップページに戻るリンクを表示する', () => {
    render(<BackLink />)
    
    const link = screen.getByRole('link', { name: /トップページに戻る/ })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })

  it('カスタムテキストとhrefを受け付ける', () => {
    render(<BackLink href="/mylists" text="マイリスト一覧に戻る" />)
    
    const link = screen.getByRole('link', { name: /マイリスト一覧に戻る/ })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/mylists')
  })

  it('矢印アイコンが含まれている', () => {
    render(<BackLink />)
    
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('←')
  })

  it('適切なスタイルクラスが適用される', () => {
    render(<BackLink />)
    
    const link = screen.getByRole('link')
    // CSS Modulesでクラス名が変換されるため、クラス名の存在を確認
    expect(link.className).toMatch(/backLink/)
  })

  it('追加のclassNameを受け付ける', () => {
    render(<BackLink className="custom-class" />)
    
    const link = screen.getByRole('link')
    expect(link).toHaveClass('custom-class')
  })
})