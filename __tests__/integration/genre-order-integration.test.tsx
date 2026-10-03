import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockApplyChanges, mockCancelChanges, mockNgList } = vi.hoisted(() => ({
  mockApplyChanges: vi.fn(),
  mockCancelChanges: vi.fn(),
  mockNgList: {
    videoIds: [],
    videoTitles: { exact: [], partial: [] },
    authorIds: [],
    authorNames: { exact: [], partial: [] },
    tags: {
      locked: { exact: [], partial: [] },
      user: { exact: [], partial: [] },
      both: { exact: [], partial: [] },
    },
    version: 2,
    totalCount: 0,
    updatedAt: '2026-04-21T00:00:00.000Z',
  },
}))

vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: mockNgList,
    saveNGListDirectly: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light', showTags: false },
    updatePreferences: vi.fn(),
  }),
}))

vi.mock('@/components/genre-order', () => ({
  GenreOrderCustomizer: React.forwardRef(function MockGenreOrderCustomizer(
    {
      onChangesUpdate,
    }: {
      onChangesUpdate?: (hasChanges: boolean) => void
    },
    ref: React.ForwardedRef<{ applyChanges: () => void; cancelChanges: () => void }>
  ) {
    React.useImperativeHandle(ref, () => ({
      applyChanges: mockApplyChanges,
      cancelChanges: mockCancelChanges,
    }))

    return (
      <div>
        <p>ドラッグ&ドロップでジャンルの順序を変更したり、表示/非表示を切り替えることができます。</p>
        <button onClick={() => onChangesUpdate?.(true)}>変更を発生</button>
        <button>デフォルトに戻す</button>
      </div>
    )
  }),
}))

import { SettingsModal } from '@/components/settings-modal'

// 設定項目タブはアイコン（aria-hidden）＋「ジャンル」の表示で、アクセシブルネームは「ジャンル」になる
const getGenreTab = (): HTMLElement =>
  within(screen.getByRole('group', { name: '設定項目' })).getByRole('button', { name: 'ジャンル' })

describe('Genre Order Integration', () => {
  const reloadMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    })
  })

  it('shows genre order tab in settings modal', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)

    const genreTab = getGenreTab()
    expect(genreTab).toBeInTheDocument()
    // 初期表示は NGリスト タブなので、ジャンルタブは未選択
    expect(genreTab).toHaveAttribute('aria-pressed', 'false')
  })

  it('displays genre order customizer when tab is clicked', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(getGenreTab())

    expect(getGenreTab()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'ジャンル並び替え' })).toBeInTheDocument()
    expect(screen.getByText(/ドラッグ&ドロップでジャンルの順序を変更/)).toBeInTheDocument()
    expect(screen.getByText('デフォルトに戻す')).toBeInTheDocument()
  })

  it('shows apply button when genre order changes are reported', async () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(getGenreTab())
    expect(screen.queryByRole('button', { name: '適用' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '変更を発生' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '適用' })).toBeInTheDocument()
    })
  })

  it('applies genre order changes when apply is clicked', async () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(getGenreTab())
    fireEvent.click(screen.getByRole('button', { name: '変更を発生' }))

    fireEvent.click(await screen.findByRole('button', { name: '適用' }))

    expect(mockApplyChanges).toHaveBeenCalledTimes(1)
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('confirms before closing with unsaved genre order changes', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onClose = vi.fn()

    render(<SettingsModal isOpen={true} onClose={onClose} />)

    fireEvent.click(getGenreTab())
    fireEvent.click(screen.getByRole('button', { name: '変更を発生' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '適用' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '設定を閉じる' }))

    expect(confirmMock).toHaveBeenCalledWith('変更を破棄してもよろしいですか？')
    expect(onClose).not.toHaveBeenCalled()
    expect(mockCancelChanges).not.toHaveBeenCalled()

    confirmMock.mockRestore()
  })
})
