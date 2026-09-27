// NG 選択のポップオーバー（ランキングと検索の両方の PC 表示で使う）の投稿者の選択肢のテスト。
// 投稿者 ID・名前は合成値
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PopoverNGSelector } from '@/components/popover-ng-selector'
import type { RankingItem } from '@/types/ranking'

const baseVideo: RankingItem = {
  rank: 1,
  id: 'sm100',
  title: 'title sm100',
  thumbURL: '',
  views: 1,
  authorId: '1001',
}

function renderSelector(video: RankingItem, onAdd = vi.fn()) {
  const anchorRef = { current: document.createElement('button') }
  render(<PopoverNGSelector video={video} isOpen anchorRef={anchorRef} onClose={() => {}} onAdd={onAdd} />)
  return onAdd
}

describe('PopoverNGSelector の投稿者の選択肢', () => {
  beforeEach(() => {
    global.ResizeObserver = vi.fn().mockImplementation(function () {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('投稿者名が分かる行では、投稿者名と投稿者 ID の両方を出し、名前で登録する', () => {
    const onAdd = renderSelector({ ...baseVideo, authorName: 'user-1001' })
    expect(screen.getByTestId('ng-author')).toHaveTextContent('投稿者名: user-1001')
    expect(screen.getByTestId('ng-author-id')).toHaveTextContent('投稿者ID: 1001')
    fireEvent.click(screen.getByTestId('ng-author'))
    expect(onAdd).toHaveBeenCalledWith('author', 'user-1001')
  })

  it('投稿者名が無い行では、投稿者名の選択肢を出さない（ID が名前として登録されて効かないため）。投稿者 ID は出す', () => {
    const onAdd = renderSelector({ ...baseVideo, authorName: undefined })
    expect(screen.queryByTestId('ng-author')).toBeNull()
    fireEvent.click(screen.getByTestId('ng-author-id'))
    expect(onAdd).toHaveBeenCalledWith('authorId', '1001')
  })

  it('空白だけの投稿者名も名前が無いものとして扱う', () => {
    renderSelector({ ...baseVideo, authorName: '   ' })
    expect(screen.queryByTestId('ng-author')).toBeNull()
  })
})
