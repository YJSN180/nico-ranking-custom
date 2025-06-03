import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUserNGList } from '@/hooks/use-user-ng-list'

describe('NG list localStorage persistence', () => {
  beforeEach(() => {
    // localStorageをクリア
    localStorage.clear()
  })

  it('should save NG list to localStorage when adding items', () => {
    const { result } = renderHook(() => useUserNGList())
    
    // 動画IDを追加
    act(() => {
      result.current.addVideoId('sm12345')
    })
    
    // localStorageに保存されているか確認
    const stored = JSON.parse(localStorage.getItem('user-ng-list') || '{}')
    expect(stored.videoIds).toContain('sm12345')
    expect(stored.totalCount).toBe(1)
    expect(stored.version).toBe(1)
  })

  it('should restore NG list from localStorage on mount', () => {
    // 事前にデータを保存
    const savedNGList = {
      videoIds: ['sm111', 'sm222'],
      videoTitles: {
        exact: ['NGタイトル1'],
        partial: ['NG部分']
      },
      authorIds: ['user123'],
      authorNames: {
        exact: ['NG投稿者'],
        partial: []
      },
      version: 1,
      totalCount: 5,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem('user-ng-list', JSON.stringify(savedNGList))
    
    // フックをマウント
    const { result } = renderHook(() => useUserNGList())
    
    // 保存されたデータが読み込まれているか確認
    expect(result.current.ngList.videoIds).toEqual(['sm111', 'sm222'])
    expect(result.current.ngList.videoTitles.exact).toEqual(['NGタイトル1'])
    expect(result.current.ngList.videoTitles.partial).toEqual(['NG部分'])
    expect(result.current.ngList.authorIds).toEqual(['user123'])
    expect(result.current.ngList.authorNames.exact).toEqual(['NG投稿者'])
    expect(result.current.ngList.totalCount).toBe(5)
  })

  it('should update localStorage when removing items', () => {
    const { result } = renderHook(() => useUserNGList())
    
    // 複数のアイテムを追加
    act(() => {
      result.current.addVideoId('sm111')
      result.current.addVideoId('sm222')
      result.current.addVideoTitle('NGタイトル', 'exact')
    })
    
    // 1つ削除
    act(() => {
      result.current.removeVideoId('sm111')
    })
    
    const stored = JSON.parse(localStorage.getItem('user-ng-list') || '{}')
    expect(stored.videoIds).toEqual(['sm222'])
    expect(stored.totalCount).toBe(2) // sm222 + NGタイトル
  })

  it('should filter items based on NG list', () => {
    const { result } = renderHook(() => useUserNGList())
    
    // NGリストを設定
    act(() => {
      result.current.addVideoId('sm111')
      result.current.addVideoTitle('NG', 'partial')
      result.current.addAuthorName('悪い投稿者', 'exact')
    })
    
    // テストデータ
    const items = [
      { id: 'sm111', title: '動画1', authorName: '投稿者A' },
      { id: 'sm222', title: 'NG動画', authorName: '投稿者B' },
      { id: 'sm333', title: '動画3', authorName: '悪い投稿者' },
      { id: 'sm444', title: '良い動画', authorName: '良い投稿者' }
    ]
    
    const filtered = result.current.filterItems(items)
    
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('sm444')
  })

  it('should persist NG list through resets', () => {
    const { result } = renderHook(() => useUserNGList())
    
    // データを追加
    act(() => {
      result.current.addVideoId('sm12345')
      result.current.addAuthorId('user123')
    })
    
    // リセット
    act(() => {
      result.current.resetNGList()
    })
    
    const stored = JSON.parse(localStorage.getItem('user-ng-list') || '{}')
    expect(stored.videoIds).toEqual([])
    expect(stored.authorIds).toEqual([])
    expect(stored.totalCount).toBe(0)
    expect(stored.version).toBe(1)
  })
})