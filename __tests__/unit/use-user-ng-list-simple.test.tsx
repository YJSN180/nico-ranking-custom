import { describe, test, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUserNGList, type UserNGList } from '@/hooks/use-user-ng-list'

describe('useUserNGList (Apply Button System)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('初期状態で空のNGリストを返す', () => {
    const { result } = renderHook(() => useUserNGList())

    expect(result.current.ngList.videoIds).toEqual([])
    expect(result.current.ngList.videoTitles.exact).toEqual([])
    expect(result.current.ngList.videoTitles.partial).toEqual([])
    expect(result.current.ngList.authorIds).toEqual([])
    expect(result.current.ngList.authorNames.exact).toEqual([])
    expect(result.current.ngList.authorNames.partial).toEqual([])
    expect(result.current.ngList.totalCount).toBe(0)
  })

  test('saveNGListDirectlyでNGリストを保存できる', () => {
    const { result } = renderHook(() => useUserNGList())

    const newNGList: UserNGList = {
      videoIds: ['sm12345678'],
      videoTitles: { exact: ['テストタイトル'], partial: ['部分'] },
      authorIds: ['12345'],
      authorNames: { exact: ['テスト投稿者'], partial: ['bot'] },
      version: 1,
      totalCount: 5,
      updatedAt: new Date().toISOString()
    }

    act(() => {
      result.current.saveNGListDirectly(newNGList)
    })

    expect(result.current.ngList.videoIds).toEqual(['sm12345678'])
    expect(result.current.ngList.videoTitles.exact).toEqual(['テストタイトル'])
    expect(result.current.ngList.videoTitles.partial).toEqual(['部分'])
    expect(result.current.ngList.authorIds).toEqual(['12345'])
    expect(result.current.ngList.authorNames.exact).toEqual(['テスト投稿者'])
    expect(result.current.ngList.authorNames.partial).toEqual(['bot'])
    expect(result.current.ngList.totalCount).toBe(6)
  })

  test('filterItemsが正しく動作する', () => {
    const { result } = renderHook(() => useUserNGList())

    const newNGList: UserNGList = {
      videoIds: ['sm12345678'],
      videoTitles: { exact: ['NGタイトル'], partial: ['NG部分'] },
      authorIds: ['ng-author'],
      authorNames: { exact: ['NG投稿者'], partial: ['ngbot'] },
      version: 1,
      totalCount: 5,
      updatedAt: new Date().toISOString()
    }

    act(() => {
      result.current.saveNGListDirectly(newNGList)
    })

    const testItems = [
      { id: 'sm12345678', title: '動画1', authorId: 'author1', authorName: '投稿者1' }, // NG (動画ID)
      { id: 'sm87654321', title: 'NGタイトル', authorId: 'author2', authorName: '投稿者2' }, // NG (タイトル完全一致)
      { id: 'sm11111111', title: 'NG部分を含む動画', authorId: 'author3', authorName: '投稿者3' }, // NG (タイトル部分一致)
      { id: 'sm22222222', title: '正常な動画', authorId: 'ng-author', authorName: '投稿者4' }, // NG (投稿者ID)
      { id: 'sm33333333', title: '正常な動画2', authorId: 'author5', authorName: 'NG投稿者' }, // NG (投稿者名完全一致)
      { id: 'sm44444444', title: '正常な動画3', authorId: 'author6', authorName: 'ngbot123' }, // NG (投稿者名部分一致)
      { id: 'sm55555555', title: '正常な動画4', authorId: 'author7', authorName: '正常投稿者' }, // OK
    ]

    const filteredItems = result.current.filterItems(testItems)

    expect(filteredItems).toHaveLength(1)
    expect(filteredItems[0]?.id).toBe('sm55555555')
  })

  test('localStorageに保存される', () => {
    const { result } = renderHook(() => useUserNGList())

    const newNGList: UserNGList = {
      videoIds: ['sm99999999'],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString()
    }

    act(() => {
      result.current.saveNGListDirectly(newNGList)
    })

    const stored = localStorage.getItem('user-ng-list')
    expect(stored).not.toBeNull()
    
    const parsed = JSON.parse(stored!)
    expect(parsed.videoIds).toEqual(['sm99999999'])
    expect(parsed.totalCount).toBe(1)
  })
})