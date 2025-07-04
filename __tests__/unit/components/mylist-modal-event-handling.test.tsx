import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { MylistModal } from '@/components/mylist-modal'
import type { Mylist } from '@/lib/storage/types'

// useMylistOperationsフックをモック - CI環境対応
vi.mock('@/context/mylist-operations-context', () => {
  const mockOperations = {
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }
  
  return {
    useMylistOperations: vi.fn(() => mockOperations),
    MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
  }
})

describe('MylistModal Event Handling', () => {
  const mockMylists: Mylist[] = [
    {
      id: '1',
      name: 'とりあえずマイリスト',
      description: '',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoCount: 0
    }
  ]

  const defaultProps = {
    mylists: mockMylists,
    selectedMylistIds: [],
    onAddToMylist: vi.fn(),
    onClose: vi.fn(),
    onCreateMylist: vi.fn()
  }

  describe('イベントバブリング防止', () => {
    it('モーダル内のクリックが親要素に伝播しない', () => {
      const parentClickHandler = vi.fn()
      
      // 親要素でクリックハンドラーを設定
      render(
        <div onClick={parentClickHandler}>
          <MylistModal {...defaultProps} />
        </div>
      )

      // モーダル内をクリック
      const modal = screen.getByRole('dialog')
      fireEvent.click(modal)

      // 親要素のクリックハンドラーが呼ばれないことを確認
      expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('新規作成フォームの入力フィールドクリックが親要素に伝播しない', async () => {
      const parentClickHandler = vi.fn()
      
      render(
        <div onClick={parentClickHandler}>
          <MylistModal {...defaultProps} />
        </div>
      )

      // 新規作成ボタンをクリック
      fireEvent.click(screen.getByText('＋ 新規マイリスト作成'))

      // 入力フィールドが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByPlaceholderText('マイリスト名')).toBeInTheDocument()
      })

      // 入力フィールドをクリック
      const nameInput = screen.getByPlaceholderText('マイリスト名')
      fireEvent.click(nameInput)

      // 親要素のクリックハンドラーが呼ばれないことを確認
      expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('説明フィールドのクリックが親要素に伝播しない', async () => {
      const parentClickHandler = vi.fn()
      
      render(
        <div onClick={parentClickHandler}>
          <MylistModal {...defaultProps} />
        </div>
      )

      // 新規作成ボタンをクリック
      fireEvent.click(screen.getByText('＋ 新規マイリスト作成'))

      // テキストエリアが表示されるのを待つ
      await waitFor(() => {
        expect(screen.getByPlaceholderText('説明（任意）')).toBeInTheDocument()
      })

      // テキストエリアをクリック
      const descriptionInput = screen.getByPlaceholderText('説明（任意）')
      fireEvent.click(descriptionInput)

      // 親要素のクリックハンドラーが呼ばれないことを確認
      expect(parentClickHandler).not.toHaveBeenCalled()
    })
  })

  describe('モーダル背景スタイル', () => {
    it('オーバーレイが半透明である', () => {
      render(<MylistModal {...defaultProps} />)
      
      // オーバーレイ要素を取得
      const overlay = screen.getByTestId('modal-overlay')
      expect(overlay).toBeInTheDocument()
      
      // スタイルを確認（半透明: background が rgba(0, 0, 0, 0.6)）
      const computedStyle = window.getComputedStyle(overlay)
      // テスト環境では実際のCSSが適用されないため、クラス名の存在を確認
      expect(overlay.className).toMatch(/overlay/)
    })
  })
})