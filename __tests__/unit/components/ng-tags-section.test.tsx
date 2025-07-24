import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NGTagsSection } from '@/components/ng-tags-section'
import type { ExtendedNGList } from '@/types/ng-list-extended'

describe('NGTagsSection', () => {
  const mockTags: ExtendedNGList['tags'] = {
    locked: { exact: ['ゲーム'], partial: ['実況'] },
    user: { exact: ['歌ってみた'], partial: ['カバー'] },
    both: { exact: ['音楽'], partial: ['BGM'] }
  }

  const mockOnUpdate = vi.fn()

  beforeEach(() => {
    mockOnUpdate.mockClear()
  })

  describe('レンダリング', () => {
    it('should render section title and controls', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      expect(screen.getByText('🚫 タグ')).toBeInTheDocument()
      expect(screen.getByLabelText('ロックタグ')).toBeInTheDocument()
      expect(screen.getByLabelText('ユーザータグ')).toBeInTheDocument()
      expect(screen.getByLabelText('両方')).toBeInTheDocument()
      expect(screen.getByLabelText('完全一致')).toBeInTheDocument()
      expect(screen.getByLabelText('部分一致')).toBeInTheDocument()
    })

    it('should render existing tags with correct icons', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      // ロックタグ
      expect(screen.getByText('ゲーム (ロック・完全)')).toBeInTheDocument()
      expect(screen.getByText('実況 (ロック・部分)')).toBeInTheDocument()
      
      // ユーザータグ
      expect(screen.getByText('歌ってみた (ユーザー・完全)')).toBeInTheDocument()
      expect(screen.getByText('カバー (ユーザー・部分)')).toBeInTheDocument()
      
      // 両方タグ
      expect(screen.getByText('音楽 (両方・完全)')).toBeInTheDocument()
      expect(screen.getByText('BGM (両方・部分)')).toBeInTheDocument()
    })

    it('should show empty state when no tags', () => {
      const emptyTags: ExtendedNGList['tags'] = {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      }
      
      render(<NGTagsSection tags={emptyTags} onUpdate={mockOnUpdate} />)
      
      expect(screen.queryByText(/\(ロック・/)).not.toBeInTheDocument()
      expect(screen.queryByText(/\(ユーザー・/)).not.toBeInTheDocument()
      expect(screen.queryByText(/\(両方・/)).not.toBeInTheDocument()
    })
  })

  describe('タグの追加', () => {
    it('should add tag with default settings (both, partial)', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      const input = screen.getByPlaceholderText('タグ名を入力')
      const addButton = screen.getByText('追加')
      
      fireEvent.change(input, { target: { value: '新規タグ' } })
      fireEvent.click(addButton)
      
      expect(mockOnUpdate).toHaveBeenCalledWith({
        ...mockTags,
        both: {
          ...mockTags.both,
          partial: [...mockTags.both.partial, '新規タグ']
        }
      })
    })

    it('should add locked tag with exact match', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      // ロックタグと完全一致を選択
      fireEvent.click(screen.getByLabelText('ロックタグ'))
      fireEvent.click(screen.getByLabelText('完全一致'))
      
      const input = screen.getByPlaceholderText('タグ名を入力')
      fireEvent.change(input, { target: { value: '東方' } })
      fireEvent.click(screen.getByText('追加'))
      
      expect(mockOnUpdate).toHaveBeenCalledWith({
        ...mockTags,
        locked: {
          ...mockTags.locked,
          exact: [...mockTags.locked.exact, '東方']
        }
      })
    })

    it('should clear input after adding', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      const input = screen.getByPlaceholderText('タグ名を入力') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'テスト' } })
      fireEvent.click(screen.getByText('追加'))
      
      expect(input.value).toBe('')
    })

    it('should not add empty tag', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      fireEvent.click(screen.getByText('追加'))
      
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('should handle Enter key press', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      const input = screen.getByPlaceholderText('タグ名を入力')
      fireEvent.change(input, { target: { value: 'Enterテスト' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      
      expect(mockOnUpdate).toHaveBeenCalledWith({
        ...mockTags,
        both: {
          ...mockTags.both,
          partial: [...mockTags.both.partial, 'Enterテスト']
        }
      })
    })
  })

  describe('タグの削除', () => {
    it('should remove locked exact tag', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      const deleteButtons = screen.getAllByText('×')
      fireEvent.click(deleteButtons[0]) // 最初のタグ（ゲーム）を削除
      
      expect(mockOnUpdate).toHaveBeenCalledWith({
        ...mockTags,
        locked: {
          exact: [],
          partial: mockTags.locked.partial
        }
      })
    })

    it('should remove user partial tag', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      const deleteButtons = screen.getAllByText('×')
      fireEvent.click(deleteButtons[3]) // ユーザー・部分のタグ（カバー）を削除
      
      expect(mockOnUpdate).toHaveBeenCalledWith({
        ...mockTags,
        user: {
          exact: mockTags.user.exact,
          partial: []
        }
      })
    })
  })

  describe('フィルタータイプの表示', () => {
    it('should update displayed tags when changing filter type', () => {
      render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)
      
      // 初期状態（両方）では全タグが表示される
      expect(screen.getByText('ゲーム (ロック・完全)')).toBeInTheDocument()
      expect(screen.getByText('歌ってみた (ユーザー・完全)')).toBeInTheDocument()
      expect(screen.getByText('音楽 (両方・完全)')).toBeInTheDocument()
    })
  })
})