import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickNGButton } from '../../components/quick-ng-button'
import type { RankingItem } from '../../types/ranking'

// Mock dependencies
vi.mock('../../components/popover-ng-selector', () => ({
  PopoverNGSelector: ({ video, isOpen, onClose, onAdd }: any) => 
    isOpen ? (
      <div data-testid="ng-popover">
        <button data-testid="ng-video-id" onClick={() => onAdd('videoId', video.id)}>
          Video ID
        </button>
        <button data-testid="ng-title" onClick={() => onAdd('title', video.title)}>
          Title
        </button>
        <button data-testid="ng-author" onClick={() => onAdd('author', video.authorName)}>
          Author
        </button>
        <button data-testid="ng-author-id" onClick={() => onAdd('authorId', video.authorId)}>
          Author ID
        </button>
        <button data-testid="ng-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null
}))

const mockVideo: RankingItem = {
  rank: 1,
  id: 'sm12345',
  title: 'Test Video Title',
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1000,
  comments: 100,
  mylists: 50,
  likes: 30,
  authorId: 'user123',
  authorName: 'Test Author',
  registeredAt: '2025-01-01T00:00:00Z',
  tagDetails: [
    { name: 'ゲーム', isLocked: true },
    { name: '実況プレイ', isLocked: false }
  ]
}

describe('QuickNGButton', () => {
  describe('基本レンダリング', () => {
    it('NGボタンが表示される', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      expect(button).toBeInTheDocument()
    })

    it('禁止アイコンが表示される', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      expect(button).toHaveTextContent('🚫')
    })

    it('disabled状態で正しく表示される', () => {
      render(<QuickNGButton video={mockVideo} disabled />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      expect(button).toBeDisabled()
      expect(button).toHaveClass('quick-ng-button--disabled')
    })
  })

  describe('ポップオーバー表示', () => {
    it('ボタンクリックでポップオーバーが表示される', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      expect(screen.getByTestId('ng-popover')).toBeInTheDocument()
    })

    it('ESCキーでポップオーバーが閉じる', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      expect(screen.getByTestId('ng-popover')).toBeInTheDocument()
      
      fireEvent.keyDown(document, { key: 'Escape' })
      
      expect(screen.queryByTestId('ng-popover')).not.toBeInTheDocument()
    })

    it('外部クリックでポップオーバーが閉じる', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      expect(screen.getByTestId('ng-popover')).toBeInTheDocument()
      
      fireEvent.click(document.body)
      
      expect(screen.queryByTestId('ng-popover')).not.toBeInTheDocument()
    })
  })

  describe('NG追加機能', () => {
    it('Video ID追加が正しく動作する', () => {
      const onNGAdded = vi.fn()
      render(<QuickNGButton video={mockVideo} onNGAdded={onNGAdded} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      const videoIdButton = screen.getByTestId('ng-video-id')
      fireEvent.click(videoIdButton)
      
      expect(onNGAdded).toHaveBeenCalledWith('videoId', 'sm12345')
    })

    it('タイトル追加が正しく動作する', () => {
      const onNGAdded = vi.fn()
      render(<QuickNGButton video={mockVideo} onNGAdded={onNGAdded} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      const titleButton = screen.getByTestId('ng-title')
      fireEvent.click(titleButton)
      
      expect(onNGAdded).toHaveBeenCalledWith('title', 'Test Video Title')
    })

    it('投稿者追加が正しく動作する', () => {
      const onNGAdded = vi.fn()
      render(<QuickNGButton video={mockVideo} onNGAdded={onNGAdded} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      const authorButton = screen.getByTestId('ng-author')
      fireEvent.click(authorButton)
      
      expect(onNGAdded).toHaveBeenCalledWith('author', 'Test Author')
    })

    it('投稿者ID追加が正しく動作する', () => {
      const onNGAdded = vi.fn()
      render(<QuickNGButton video={mockVideo} onNGAdded={onNGAdded} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      const authorIdButton = screen.getByTestId('ng-author-id')
      fireEvent.click(authorIdButton)
      
      expect(onNGAdded).toHaveBeenCalledWith('authorId', 'user123')
    })
  })

  describe('アクセシビリティ', () => {
    it('適切なARIA属性が設定される', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      expect(button).toHaveAttribute('aria-haspopup', 'true')
      expect(button).toHaveAttribute('aria-expanded', 'false')
    })

    it('ポップオーバー表示時にaria-expandedが更新される', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      fireEvent.click(button)
      
      expect(button).toHaveAttribute('aria-expanded', 'true')
    })

    it('キーボード操作に対応している', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      button.focus()
      
      fireEvent.keyDown(button, { key: 'Enter' })
      
      expect(screen.getByTestId('ng-popover')).toBeInTheDocument()
    })
  })

  describe('スタイル整合性', () => {
    it('適切なCSSクラスが適用される', () => {
      render(<QuickNGButton video={mockVideo} />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      expect(button).toHaveClass('quick-ng-button')
      expect(button).not.toHaveClass('quick-ng-button--disabled')
    })

    it('無効化状態で適切なクラスが適用される', () => {
      render(<QuickNGButton video={mockVideo} disabled />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      expect(button).toHaveClass('quick-ng-button')
      expect(button).toHaveClass('quick-ng-button--disabled')
    })

    it('カスタムクラス名が適用される', () => {
      render(<QuickNGButton video={mockVideo} className="custom-class" />)
      
      const button = screen.getByRole('button', { name: /ng追加/i })
      expect(button).toHaveClass('quick-ng-button')
      expect(button).toHaveClass('custom-class')
    })
  })
})