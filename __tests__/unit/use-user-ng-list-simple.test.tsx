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