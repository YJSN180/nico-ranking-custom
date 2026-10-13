import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import type { RankingItem } from '@/types/ranking'

// マイリストのモーダルを閉じると、行（data-video-id）にインラインの背景色
// （var(--surface-color)）が残っていた。インライン指定は CSS より強いので、PC ではその行だけ
// ホバーの色が出なくなり、背景を透明にしている行（検索ページのフラット表示）には色が付く。

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

const item: RankingItem = {
  id: 'sm90000301',
  rank: 5,
  title: '合成タイトル',
  thumbURL: 'https://example.com/thumb.jpg',
  views: 10,
  comments: 1,
  mylists: 1,
  likes: 1,
  authorId: '90000301',
  authorName: '合成投稿者'
}

// jsdom は ontouchstart を持つ（＝タッチ端末扱い）。PC（タッチ非対応）の条件にするため一時的に外す
function findOwner(target: object, key: string): object | null {
  let current: object | null = target
  while (current && !Object.prototype.hasOwnProperty.call(current, key)) {
    current = Object.getPrototypeOf(current)
  }
  return current
}

// jsdom の style は var(...) の色を受け付けず黙って捨てるため、読み戻しでは確かめられない。
// backgroundColor への書き込みそのものを記録する
function recordBackgroundColorWrites() {
  const proto = window.CSSStyleDeclaration.prototype
  const original = Object.getOwnPropertyDescriptor(proto, 'backgroundColor')
  const writes: Array<{ style: CSSStyleDeclaration; value: string }> = []
  Object.defineProperty(proto, 'backgroundColor', {
    configurable: true,
    enumerable: original?.enumerable ?? true,
    get(this: CSSStyleDeclaration) {
      return original?.get?.call(this) ?? ''
    },
    set(this: CSSStyleDeclaration, value: string) {
      writes.push({ style: this, value })
      original?.set?.call(this, value)
    }
  })
  return {
    writes,
    restore: () => {
      if (original) Object.defineProperty(proto, 'backgroundColor', original)
    }
  }
}

describe('MylistButton: モーダルを閉じたあとの行の背景', () => {
  let owner: object | null = null
  let descriptor: PropertyDescriptor | undefined
  let recorder: ReturnType<typeof recordBackgroundColorWrites>

  beforeEach(() => {
    owner = findOwner(window, 'ontouchstart')
    descriptor = owner ? Object.getOwnPropertyDescriptor(owner, 'ontouchstart') : undefined
    if (owner) delete (owner as Record<string, unknown>).ontouchstart
    recorder = recordBackgroundColorWrites()
  })

  afterEach(() => {
    recorder.restore()
    if (owner && descriptor) Object.defineProperty(owner, 'ontouchstart', descriptor)
  })

  it('前提: PC（タッチ非対応）の条件になっている', () => {
    expect('ontouchstart' in window).toBe(false)
  })

  it('閉じても、行にインラインの背景色を書き込まない', async () => {
    const { container } = render(
      <TagDisplayProvider>
        <RankingItemResponsive item={item} />
      </TagDisplayProvider>
    )
    const row = container.querySelector(`[data-video-id="${item.id}"]`) as HTMLElement
    const pcButton = container.querySelector(
      '.ranking-item-responsive__mylist-area [data-testid="mylist-button"]'
    ) as HTMLElement

    fireEvent.click(pcButton)
    fireEvent.click(await screen.findByTestId('mylist-modal-close'))

    expect(screen.queryByTestId('mylist-modal')).toBeNull()
    const rowWrites = recorder.writes.filter((write) => write.style === row.style).map((write) => write.value)
    expect(rowWrites).toEqual([])
  })
})
