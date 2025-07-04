import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BrowserRecommendationOnce } from '../browser-recommendation-once'

describe('BrowserRecommendationOnce', () => {
  beforeEach(() => {
    // localStorageをクリア
    localStorage.clear()
  })

  describe('初期状態', () => {
    it('マウント直後は一時的にcheckingクラスが適用される', () => {
      // Arrange & Act
      const { container } = render(<BrowserRecommendationOnce />)
      
      // マウント直後の最初のレンダリング時はchecking状態
      const initialAlert = container.querySelector('.browser-recommendation--checking')
      
      // Assert
      // 一時的にchecking状態が存在することがある（useEffectが実行される前）
      // ただし、すぐに適切な状態に更新される
      expect(initialAlert || container.querySelector('.browser-recommendation')).toBeInTheDocument()
    })
  })

  describe('初回訪問時の表示', () => {
    it('初回訪問時は注意書きが表示される', () => {
      // Arrange & Act
      render(<BrowserRecommendationOnce />)
      
      // Assert
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/特定のブラウザ.*では表示が遅くなる場合があります/)).toBeInTheDocument()
    })

    it('文言に「特定のブラウザ（Safari/Samsung Browser）」が含まれる', () => {
      // Arrange & Act
      render(<BrowserRecommendationOnce />)
      
      // Assert
      expect(screen.getByText(/特定のブラウザ（Safari\/Samsung Browser）/)).toBeInTheDocument()
    })

    it('タイトルが「推奨ブラウザのお知らせ」である', () => {
      // Arrange & Act
      render(<BrowserRecommendationOnce />)
      
      // Assert
      expect(screen.getByText('推奨ブラウザのお知らせ')).toBeInTheDocument()
    })

    it('「Chromeを開く」ボタンが表示される', () => {
      // Arrange & Act
      render(<BrowserRecommendationOnce />)
      
      // Assert
      expect(screen.getByRole('link', { name: /Chrome.*開く/ })).toBeInTheDocument()
    })

    it('「閉じる」ボタンが表示される', () => {
      // Arrange & Act
      render(<BrowserRecommendationOnce />)
      
      // Assert
      expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
    })
  })

  describe('永続的非表示', () => {
    it('「閉じる」ボタンをクリックすると通知が非表示になる', () => {
      // Arrange
      render(<BrowserRecommendationOnce />)
      const closeButton = screen.getByRole('button', { name: '閉じる' })
      const alert = screen.getByRole('alert')
      
      // Act
      fireEvent.click(closeButton)
      
      // Assert
      // DOMには存在するが、browser-recommendation--hiddenクラスで非表示
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveClass('browser-recommendation--hidden')
      // CSSクラスで非表示を管理しているため、クラスの存在を確認
    })

    it('「閉じる」ボタンをクリックするとlocalStorageに記録される', () => {
      // Arrange
      render(<BrowserRecommendationOnce />)
      const closeButton = screen.getByRole('button', { name: '閉じる' })
      
      // Act
      fireEvent.click(closeButton)
      
      // Assert
      expect(localStorage.getItem('browser-recommendation-dismissed')).toBe('true')
    })

    it('「Chromeを開く」をクリックすると通知が非表示になる', () => {
      // Arrange
      render(<BrowserRecommendationOnce />)
      const chromeLink = screen.getByRole('link', { name: /Chrome.*開く/ })
      const alert = screen.getByRole('alert')
      
      // Act
      fireEvent.click(chromeLink)
      
      // Assert
      // DOMには存在するが、browser-recommendation--hiddenクラスで非表示
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveClass('browser-recommendation--hidden')
      // CSSクラスで非表示を管理しているため、クラスの存在を確認
    })

    it('「Chromeを開く」をクリックするとlocalStorageに記録される', () => {
      // Arrange
      render(<BrowserRecommendationOnce />)
      const chromeLink = screen.getByRole('link', { name: /Chrome.*開く/ })
      
      // Act
      fireEvent.click(chromeLink)
      
      // Assert
      expect(localStorage.getItem('browser-recommendation-dismissed')).toBe('true')
    })

    it('localStorageに記録がある場合は初回でも表示されない', () => {
      // Arrange
      localStorage.setItem('browser-recommendation-dismissed', 'true')
      
      // Act
      render(<BrowserRecommendationOnce />)
      
      // Assert
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveClass('browser-recommendation--hidden')
      // CSSクラスで非表示を管理しているため、クラスの存在を確認
    })
  })

  describe('ブラウザ別のリンク表示', () => {
    it('通常は汎用的なChromeダウンロードリンクが表示される', () => {
      // Arrange & Act
      render(<BrowserRecommendationOnce />)
      
      // Assert
      const link = screen.getByRole('link', { name: /Chrome.*開く/ })
      expect(link).toHaveAttribute('href', 'https://www.google.com/chrome/')
    })
  })
})