import React from 'react'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect } from 'vitest'
import { ItemActionMenu } from '@/components/item-action-menu'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import { useMylistOperations } from '@/context/mylist-operations-context'
import type { RankingItem } from '@/types/ranking'

// X-g: ⋮メニューのアクセシビリティ
// - role=menu の中の操作は menuitem として公開し、矢印キーで移動できる
// - ビューの切り替え・閉じる操作でフォーカスを失わない
// - 登録済みの項目は表示どおりの名前で読み上げる
// - 統計の数値に何の数かのラベルを付ける

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
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    saveNGListDirectly: vi.fn()
  })
}))

const video: RankingItem = {
  id: 'sm90000201',
  rank: 4,
  title: '合成タイトル',
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1234,
  comments: 56,
  mylists: 7,
  likes: 89,
  authorId: '90000201',
  authorName: '合成投稿者'
}

function renderMenu(onNGAdded = vi.fn()) {
  render(<ItemActionMenu video={video} onNGAdded={onNGAdded} />)
  return screen.getByRole('button', { name: 'その他の操作' })
}

// キーボード（Enter / Space）で押したときの click は detail が 0
function openWithKeyboard(trigger: HTMLElement) {
  trigger.focus()
  fireEvent.click(trigger, { detail: 0 })
  return screen.getByRole('menu', { name: 'その他の操作' })
}

async function openNGView(trigger: HTMLElement) {
  const menu = openWithKeyboard(trigger)
  const entry = within(menu).getByRole('menuitem', { name: /NG設定/ })
  entry.focus()
  fireEvent.click(entry)
  return screen.findByRole('menu', { name: 'NGリストに追加' })
}

describe('ItemActionMenu: role=menu の中身', () => {
  it('メニューの操作はすべて menuitem として公開する', () => {
    const menu = openWithKeyboard(renderMenu())
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent?.trim())).toEqual(['＋マイリストに追加', '🚫NG設定'])
    expect(within(menu).queryAllByRole('button')).toHaveLength(0)
  })

  it('NG のビューも menuitem で構成し、見出しはメニューの名前として読む', async () => {
    const ngMenu = await openNGView(renderMenu())
    const names = within(ngMenu).getAllByRole('menuitem').map((item) => item.textContent?.replace(/\s+/g, ''))
    expect(names).toEqual([
      '‹戻る',
      '📹動画ID:sm90000201',
      '📝タイトル:合成タイトル',
      '👤投稿者名:合成投稿者',
      '🆔投稿者ID:90000201'
    ])
    expect(within(ngMenu).queryAllByRole('button')).toHaveLength(0)
  })
})

describe('ItemActionMenu: フォーカス', () => {
  it('キーボードで開くと先頭の項目にフォーカスが移る', () => {
    const menu = openWithKeyboard(renderMenu())
    expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[0])
  })

  it('NG設定を開くと、フォーカスは NG ビューの先頭（戻る）へ移る', async () => {
    const ngMenu = await openNGView(renderMenu())
    expect(document.activeElement).toBe(within(ngMenu).getByRole('menuitem', { name: /戻る/ }))
  })

  it('戻ると、フォーカスは NG設定 へ戻る', async () => {
    const ngMenu = await openNGView(renderMenu())
    fireEvent.click(within(ngMenu).getByRole('menuitem', { name: /戻る/ }))
    const menu = await screen.findByRole('menu', { name: 'その他の操作' })
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: /NG設定/ }))
  })

  it('NG ビューで Escape を押すと、メニューに戻り NG設定 にフォーカスする', async () => {
    await openNGView(renderMenu())
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    const menu = await screen.findByRole('menu', { name: 'その他の操作' })
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: /NG設定/ }))
  })

  it('Escape で閉じると、フォーカスはトリガーへ戻る', () => {
    const trigger = renderMenu()
    openWithKeyboard(trigger)
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('NG の選択肢を選ぶと閉じ、フォーカスはトリガーへ戻る', async () => {
    const onNGAdded = vi.fn()
    const trigger = renderMenu(onNGAdded)
    const ngMenu = await openNGView(trigger)
    const option = within(ngMenu).getByRole('menuitem', { name: /動画ID/ })
    option.focus()
    fireEvent.click(option)
    expect(onNGAdded).toHaveBeenCalledWith('videoId', video.id)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('矢印キー・Home・End で項目を移動できる（端では反対側へ回る）', async () => {
    const ngMenu = await openNGView(renderMenu())
    const items = within(ngMenu).getAllByRole('menuitem')

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' })
    expect(document.activeElement).toBe(items[items.length - 1])
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[items.length - 1])
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
  })

  it('マウスやタップで開いたときはフォーカスを動かさない', () => {
    const trigger = renderMenu()
    trigger.focus()
    fireEvent.click(trigger, { detail: 1 })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('ItemActionMenu: 登録済みの項目の名前', () => {
  it('登録済みのときは表示どおり「マイリスト登録済み」と読み上げる', async () => {
    vi.mocked(useMylistOperations().isVideoInAnyMylist).mockResolvedValueOnce({
      inMylist: true,
      mylistIds: ['mylist-1']
    })
    const menu = openWithKeyboard(renderMenu())
    const item = await within(menu).findByRole('menuitem', { name: 'マイリスト登録済み' })
    expect(item).not.toHaveAttribute('title')
    expect(item).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('未登録のときは「マイリストに追加」と読み上げる', async () => {
    const menu = openWithKeyboard(renderMenu())
    await waitFor(() => expect(useMylistOperations().isVideoInAnyMylist).toHaveBeenCalled())
    expect(within(menu).getByRole('menuitem', { name: 'マイリストに追加' })).toBeInTheDocument()
  })
})

describe('RankingItemResponsive: 統計の数値のラベル', () => {
  it('各数値の前に、読み上げ用のラベルがある（アイコンは読み上げない）', () => {
    render(
      <TagDisplayProvider>
        <RankingItemResponsive item={video} />
      </TagDisplayProvider>
    )
    const stats = screen.getByTestId('video-stats')
    const spoken = Array.from(stats.querySelectorAll('.ranking-item-responsive__stat')).map((stat) => {
      const clone = stat.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove())
      return clone.textContent?.replace(/\s+/g, '')
    })
    expect(spoken).toEqual(['再生数1,234', 'コメント数56', 'いいね数89', 'マイリスト数7'])
  })
})
