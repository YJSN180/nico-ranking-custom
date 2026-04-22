import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('見出しとラジオ群を表示する', () => {
    render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)

    expect(screen.getByText('🚫 タグ')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /ロックタグ/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /ユーザータグ/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /両方/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '完全一致' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '部分一致' })).toBeInTheDocument()
  })

  it('既存タグを表示する', () => {
    render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)

    expect(screen.getByText('ゲーム (ロック・完全)')).toBeInTheDocument()
    expect(screen.getByText('実況 (ロック・部分)')).toBeInTheDocument()
    expect(screen.getByText('歌ってみた (ユーザー・完全)')).toBeInTheDocument()
    expect(screen.getByText('カバー (ユーザー・部分)')).toBeInTheDocument()
    expect(screen.getByText('音楽 (両方・完全)')).toBeInTheDocument()
    expect(screen.getByText('BGM (両方・部分)')).toBeInTheDocument()
  })

  it('デフォルト設定では両方・部分一致で追加する', () => {
    render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)

    fireEvent.change(screen.getByPlaceholderText('タグ名を入力'), {
      target: { value: '新規タグ' }
    })
    fireEvent.click(screen.getByText('追加'))

    expect(mockOnUpdate).toHaveBeenCalledWith({
      ...mockTags,
      both: {
        ...mockTags.both,
        partial: [...mockTags.both.partial, '新規タグ']
      }
    })
  })

  it('ロックタグの完全一致で追加できる', () => {
    render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)

    fireEvent.click(screen.getByRole('radio', { name: /ロックタグ/ }))
    fireEvent.click(screen.getByRole('radio', { name: '完全一致' }))
    fireEvent.change(screen.getByPlaceholderText('タグ名を入力'), {
      target: { value: '東方' }
    })
    fireEvent.click(screen.getByText('追加'))

    expect(mockOnUpdate).toHaveBeenCalledWith({
      ...mockTags,
      locked: {
        ...mockTags.locked,
        exact: [...mockTags.locked.exact, '東方']
      }
    })
  })

  it('タグを削除できる', () => {
    render(<NGTagsSection tags={mockTags} onUpdate={mockOnUpdate} />)

    fireEvent.click(screen.getAllByText('×')[0])

    expect(mockOnUpdate).toHaveBeenCalledWith({
      ...mockTags,
      locked: {
        exact: [],
        partial: mockTags.locked.partial
      }
    })
  })
})
