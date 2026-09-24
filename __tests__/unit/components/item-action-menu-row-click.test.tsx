import React from 'react'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import type { RankingItem } from '@/types/ranking'

// X-c: ⋮メニューの見出しや余白、メニューから開いたモーダル（portal）をタップすると、
// クリックが行まで伝わって動画が新しいタブで開いていた。メニューの中と portal 由来の
// クリックでは動画を開かないこと。

vi.mock('@/context/mylist-operations-context', () => {
  const operations = {
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }
  return {
    useMylistOperations: vi.fn(() => operations),
    MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
  }
})

vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      tags: {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      },
      version: 2,
      totalCount: 0,
      updatedAt: new Date().toISOString()
    },
    saveNGListDirectly: vi.fn()
  })
}))

const item: RankingItem = {
  id: 'sm90000001',
  rank: 4,
  title: '合成タイトル',
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1234,
  comments: 56,
  mylists: 7,
  likes: 89,
  authorId: '90000001',
  authorName: '合成投稿者'
}

function renderRow(onQuickNGAdd = vi.fn()) {
  return render(
    <TagDisplayProvider>
      <RankingItemResponsive item={item} onQuickNGAdd={onQuickNGAdd} />
    </TagDisplayProvider>
  )
}

describe('RankingItemResponsive: ⋮メニューのクリックで動画を開かない', () => {
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  it('前提: 行の余白をクリックすると動画を開く', () => {
    const { container } = renderRow()
    fireEvent.click(container.querySelector('.ranking-item-responsive__content') as HTMLElement)
    expect(openSpy).toHaveBeenCalledTimes(1)
  })

  it('メニュー本体（余白）をクリックしても動画を開かない', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))
    fireEvent.click(screen.getByRole('menu'))
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('NG 選択ビューの見出しをクリックしても動画を開かない', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))
    fireEvent.click(screen.getByRole('button', { name: /NG設定/ }))
    fireEvent.click(screen.getByText('NGリストに追加'))
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('NG の選択肢を押すと NG に追加し、動画は開かない', () => {
    const onQuickNGAdd = vi.fn()
    renderRow(onQuickNGAdd)
    fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))
    fireEvent.click(screen.getByRole('button', { name: /NG設定/ }))
    fireEvent.click(screen.getByTestId('menu-ng-video-id'))
    expect(onQuickNGAdd).toHaveBeenCalledWith(item, 'videoId', item.id)
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('メニューから開いたマイリストのモーダル（portal）の背景をクリックしても動画を開かない', async () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))
    fireEvent.click(await within(screen.getByRole('menu')).findByRole('button', { name: /マイリストに追加/ }))
    const overlay = await screen.findByTestId('modal-overlay')
    // モーダルは body 直下（行の DOM の外）に描画される
    expect(overlay.closest('[data-testid="ranking-item"]')).toBeNull()
    fireEvent.click(overlay)
    expect(openSpy).not.toHaveBeenCalled()
  })
})
