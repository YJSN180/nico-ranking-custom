import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TagContextMenu } from '@/components/tag-context-menu'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { TagDetail } from '@/types/ranking'

function createNGList(tags: ExtendedUserNGList['tags']): ExtendedUserNGList {
  return {
    videoIds: [],
    videoTitles: { exact: [], partial: [] },
    authorIds: [],
    authorNames: { exact: [], partial: [] },
    tags,
    version: 2,
    totalCount: 0,
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

function openMenuAndClick(
  tagDetail: TagDetail,
  ngList: ExtendedUserNGList,
  item: RegExp,
) {
  const saveNGListDirectly = vi.fn()
  render(
    <TagContextMenu
      tagDetail={tagDetail}
      ngList={ngList}
      saveNGListDirectly={saveNGListDirectly}
    >
      <span>{tagDetail.name}</span>
    </TagContextMenu>,
  )
  fireEvent.click(screen.getByText(tagDetail.name))
  fireEvent.click(screen.getByRole('button', { name: item }))
  return saveNGListDirectly
}

// 修正前はタグ詳細から DAM&amp;JOY配信中 の形で登録できた。同じタグを重ねて登録しない
describe('TagContextMenu の登録済み判定', () => {
  it('treats a saved escaped name as already registered for the decoded tag', () => {
    const ngList = createNGList({
      locked: { exact: [], partial: [] },
      user: { exact: ['DAM&amp;JOY配信中'], partial: [] },
      both: { exact: ['DAM&amp;JOY配信中'], partial: [] },
    })
    const tag = { name: 'DAM&JOY配信中', isLocked: false }

    expect(
      openMenuAndClick(tag, ngList, /ユーザータグをNGリストに追加/),
    ).not.toHaveBeenCalled()
    expect(screen.getByText('既にNGリストに登録済みです')).toBeInTheDocument()
  })

  it('treats a saved decoded name as already registered for an escaped tag', () => {
    const ngList = createNGList({
      locked: { exact: [], partial: [] },
      user: { exact: [], partial: [] },
      both: { exact: ['DAM&JOY配信中'], partial: [] },
    })
    const tag = { name: 'DAM&amp;JOY配信中', isLocked: true }

    expect(
      openMenuAndClick(tag, ngList, /タグ名そのものをNGリストに追加/),
    ).not.toHaveBeenCalled()
  })

  it('adds plain names that differ only in case, as before', () => {
    const ngList = createNGList({
      locked: { exact: ['vocaloid'], partial: [] },
      user: { exact: [], partial: [] },
      both: { exact: [], partial: [] },
    })
    const tag = { name: 'VOCALOID', isLocked: true }

    const save = openMenuAndClick(tag, ngList, /ロックタグをNGリストに追加/)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].tags.locked.exact).toEqual([
      'vocaloid',
      'VOCALOID',
    ])
  })
})
