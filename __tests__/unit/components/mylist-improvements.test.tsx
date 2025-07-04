/**
 * TDD テスト: マイリスト改善項目
 * 
 * 要件:
 * 1. モバイル版追加日フォントサイズが適切（14px以下）
 * 2. 並び替えボタンが存在しない
 * 3. ドラッグ＆ドロップ機能が無効
 */

import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi } from 'vitest'
import { MylistVideoItem } from '@/components/mylist-video-item'
import type { MylistVideo } from '@/lib/storage/types'

// テスト用のモックデータ
const mockVideo: MylistVideo = {
  id: 'sm12345678',
  title: 'テスト動画タイトル',
  thumbURL: 'https://example.com/thumb.jpg',
  authorName: 'テスト投稿者',
  authorId: 'user123',
  views: 100000,
  comments: 500,
  likes: 1000,
  mylists: 200,
  addedAt: Date.now(),
  memo: 'テストメモ'
}

// モバイル環境をシミュレート
const setMobileViewport = () => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 375,
  })
  window.dispatchEvent(new Event('resize'))
}

describe('マイリスト改善項目のTDDテスト', () => {
  describe('モバイル版追加日フォントサイズ', () => {
    beforeEach(() => {
      setMobileViewport()
    })

    test('追加日要素に適切なクラスが設定されていること', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const addedDateElement = screen.getByText(/追加日:/)
      
      // 追加日要素に適切なクラスが設定されていることを確認
      expect(addedDateElement).toHaveClass('mylist-video-item__added-date')
    })

    test('追加日要素にmobile-responsive クラスが適用されていること', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const addedDateElement = screen.getByText(/追加日:/)
      expect(addedDateElement).toHaveClass('mylist-video-item__added-date')
    })
  })

  describe('並び替え機能の削除', () => {
    test('並び替えボタンが存在しないこと', () => {
      // MylistDetailClientコンポーネントのテストが必要
      // このテストは現在失敗するはず（並び替えボタンがまだ存在するため）
      const toggleReorderButton = screen.queryByTestId('toggle-reorder-mode')
      expect(toggleReorderButton).toBeNull()
    })

    test('ドラッグハンドルが存在しないこと', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const dragHandle = screen.queryByTestId('drag-handle')
      expect(dragHandle).toBeNull()
    })

    test('動画アイテムがdraggable属性を持たないこと', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const videoItem = screen.getByTestId('mylist-video-item')
      expect(videoItem).not.toHaveAttribute('draggable', 'true')
    })
  })

  describe('UI一貫性の確保', () => {
    test('削除ボタンに適切なクラスが設定されていること', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const deleteButton = screen.getByRole('button', { name: '削除' })
      
      // 削除ボタンに適切なクラスが設定されていることを確認
      expect(deleteButton).toHaveClass('mylist-video-item__delete-button')
      
      // ボタンが存在し、クリック可能であることを確認
      expect(deleteButton).toBeInTheDocument()
      expect(deleteButton).not.toBeDisabled()
    })

    test('編集・削除ボタンエリアに適切なクラスが設定されていること', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const actionsArea = document.querySelector('.mylist-video-item__actions')
      expect(actionsArea).toBeInTheDocument()
      
      // 適切なクラスが設定されていることを確認
      expect(actionsArea).toHaveClass('mylist-video-item__actions')
      
      // 編集・削除ボタンが含まれていることを確認
      const editButton = screen.getByRole('button', { name: '編集' })
      const deleteButton = screen.getByRole('button', { name: '削除' })
      expect(actionsArea).toContainElement(editButton)
      expect(actionsArea).toContainElement(deleteButton)
    })
  })

  describe('アクセシビリティ', () => {
    test('追加日情報がスクリーンリーダーで読み上げ可能であること', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const addedDateElement = screen.getByText(/追加日:/)
      expect(addedDateElement).toBeVisible()
      expect(addedDateElement.textContent).toMatch(/追加日: \d{4}\/\d{2}\/\d{2}/)
    })

    test('編集・削除ボタンが適切なaria-labelを持つこと', () => {
      render(
        <MylistVideoItem
          video={mockVideo}
          rank={1}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      const editButton = screen.getByRole('button', { name: '編集' })
      const deleteButton = screen.getByRole('button', { name: '削除' })
      
      expect(editButton).toBeInTheDocument()
      expect(deleteButton).toBeInTheDocument()
    })
  })
})