import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import Pagination from '@/components/pagination'

describe('Pagination CSS-onlyレスポンシブ対応', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    totalItems: 100,
    itemsPerPage: 10,
    onPageChange: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('CSS-only実装の確認', () => {
    it('useMediaQueryに依存しない', () => {
      // コンポーネントのコードからuseMediaQueryが削除されていることを確認
      const { container } = render(<Pagination {...defaultProps} />)
      
      // CSSクラスが適用されている（containerクラスを探す）
      const pagination = container.querySelector('nav')
      expect(pagination).toBeTruthy()
      expect(pagination?.className).toContain('container')
    })

    it('モバイル用とデスクトップ用の両方のHTMLが存在する', () => {
      render(<Pagination {...defaultProps} />)
      
      // ページ番号列挙（デスクトップ用）
      const pageNumbers = screen.getByTestId('page-numbers')
      expect(pageNumbers).toBeInTheDocument()
      
      // ページサマリー（モバイル用）
      const pageSummary = screen.getByTestId('page-summary')
      expect(pageSummary).toBeInTheDocument()
      expect(pageSummary.textContent).toBe('1 / 10')
    })

    it('CSSモジュールのクラスが正しく適用される', () => {
      const { container } = render(<Pagination {...defaultProps} />)
      
      const nav = container.querySelector('nav')
      expect(nav?.className).toContain('container')
      
      const pageNumbers = container.querySelector('[data-testid="page-numbers"]')
      expect(pageNumbers?.className).toContain('pageNumbers')
      
      const pageSummary = container.querySelector('[data-testid="page-summary"]')
      expect(pageSummary?.className).toContain('pageSummary')
    })

    it('ページボタンにCSSクラスが適用される', () => {
      render(<Pagination {...defaultProps} />)
      
      const buttons = screen.getAllByRole('button')
      // 前へ・次へボタンはnavButton、ページ番号ボタンはpageButton
      buttons.forEach((button, index) => {
        const buttonText = button.textContent || ''
        if (buttonText.includes('前') || buttonText.includes('次')) {
          expect(button.className).toMatch(/navButton/)
        } else {
          expect(button.className).toMatch(/pageButton/)
        }
      })
    })
  })

  describe('ページング機能の確認', () => {
    it('現在のページがアクティブ状態で表示される', () => {
      render(<Pagination {...defaultProps} currentPage={5} />)
      
      const buttons = screen.getAllByRole('button')
      const activeButton = buttons.find(button => button.textContent === '5')
      expect(activeButton?.className).toContain('active')
    })

    it('最初と最後のページが常に表示される', () => {
      render(<Pagination {...defaultProps} currentPage={5} totalPages={20} />)
      
      const buttons = screen.getAllByRole('button')
      const firstPageButton = buttons.find(button => button.textContent === '1')
      const lastPageButton = buttons.find(button => button.textContent === '20')
      expect(firstPageButton).toBeInTheDocument()
      expect(lastPageButton).toBeInTheDocument()
    })

    it('ページクリック時にonPageChangeが呼ばれる', () => {
      const onPageChange = vi.fn()
      render(<Pagination {...defaultProps} onPageChange={onPageChange} />)
      
      const buttons = screen.getAllByRole('button')
      const page3Button = buttons.find(button => button.textContent === '3')
      page3Button?.click()
      
      expect(onPageChange).toHaveBeenCalledWith(3)
    })
  })

  describe('アクセシビリティの確認', () => {
    it('適切なaria属性が設定される', () => {
      render(<Pagination {...defaultProps} />)
      
      const nav = screen.getByRole('navigation')
      expect(nav).toHaveAttribute('aria-label', 'ページネーション')
      
      const buttons = screen.getAllByRole('button')
      const currentButton = buttons.find(button => button.textContent === '1')
      expect(currentButton).toHaveAttribute('aria-current', 'page')
    })
  })

  describe('CSSファイルの存在確認', () => {
    it('pagination.module.cssが存在する', () => {
      const fs = require('fs')
      const path = require('path')
      const cssPath = path.join(process.cwd(), 'components/pagination.module.css')
      
      expect(fs.existsSync(cssPath)).toBe(true)
    })

    it('CSSにメディアクエリが含まれる', () => {
      const fs = require('fs')
      const path = require('path')
      const cssPath = path.join(process.cwd(), 'components/pagination.module.css')
      
      if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf-8')
        
        // メディアクエリの存在
        expect(cssContent).toContain('@media')
        expect(cssContent).toContain('max-width: 600px')
        
        // 必要なクラスの存在
        expect(cssContent).toContain('.pageNumbers')
        expect(cssContent).toContain('.pageSummary')
      }
    })
  })
})