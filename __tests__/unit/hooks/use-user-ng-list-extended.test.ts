import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUserNGListExtended } from '../../../hooks/use-user-ng-list-extended'
import type { ExtendedUserNGList } from '../../../types/ng-list-extended'

describe('useUserNGListExtended', () => {
  const STORAGE_KEY = 'user-ng-list'
  
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    localStorage.clear()
  })

  describe('初期化', () => {
    it('should return default extended NG list when storage is empty', () => {
      const { result } = renderHook(() => useUserNGListExtended())
      
      expect(result.current.ngList).toMatchObject({
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
        totalCount: 0
      })
    })
    
    it('should migrate version 1 NG list to version 2', () => {
      const v1List = {
        videoIds: ['sm1'],
        videoTitles: { exact: ['Title1'], partial: ['Part1'] },
        authorIds: ['author1'],
        authorNames: { exact: ['Author1'], partial: ['Auth1'] },
        version: 1,
        totalCount: 5,
        updatedAt: '2025-01-01T00:00:00Z'
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v1List))
      
      const { result } = renderHook(() => useUserNGListExtended())
      
      expect(result.current.ngList.version).toBe(2)
      expect(result.current.ngList.tags).toEqual({
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      })
      // 既存データが保持されていることを確認
      expect(result.current.ngList.videoIds).toEqual(['sm1'])
      expect(result.current.ngList.totalCount).toBe(5)
    })
    
    it('should load existing version 2 NG list', () => {
      const v2List: ExtendedUserNGList = {
        videoIds: ['sm2'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['ゲーム'], partial: [] },
          user: { exact: [], partial: ['歌ってみた'] },
          both: { exact: [], partial: [] }
        },
        version: 2,
        totalCount: 3,
        updatedAt: '2025-01-02T00:00:00Z'
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v2List))
      
      const { result } = renderHook(() => useUserNGListExtended())
      
      expect(result.current.ngList).toEqual(v2List)
    })
  })

  describe('保存機能', () => {
    it('should save NG list with tags and recalculate total count', () => {
      const { result } = renderHook(() => useUserNGListExtended())
      
      const newList: ExtendedUserNGList = {
        videoIds: ['sm1', 'sm2'],
        videoTitles: { exact: ['Title1'], partial: ['Part1'] },
        authorIds: ['author1'],
        authorNames: { exact: ['Author1'], partial: [] },
        tags: {
          locked: { exact: ['ゲーム'], partial: ['実況'] },
          user: { exact: ['歌ってみた'], partial: [] },
          both: { exact: [], partial: ['BGM'] }
        },
        version: 2,
        totalCount: 0, // 再計算される
        updatedAt: ''
      }
      
      act(() => {
        result.current.saveNGListDirectly(newList)
      })
      
      // 総数が正しく計算されているか
      expect(result.current.ngList.totalCount).toBe(10) // 2+1+1+1+1+1+1+1+0+1
      
      // localStorageに保存されているか
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.totalCount).toBe(10)
      expect(stored.tags).toEqual(newList.tags)
    })
    
    it('should dispatch ngListUpdated event on save', () => {
      const { result } = renderHook(() => useUserNGListExtended())
      const eventListener = vi.fn()
      
      window.addEventListener('ngListUpdated', eventListener)
      
      act(() => {
        result.current.saveNGListDirectly({
          ...result.current.ngList,
          videoIds: ['sm1']
        })
      })
      
      expect(eventListener).toHaveBeenCalled()
      const event = eventListener.mock.calls[0][0] as CustomEvent
      expect(event.detail.ngList.videoIds).toEqual(['sm1'])
      
      window.removeEventListener('ngListUpdated', eventListener)
    })
  })

  describe('ストレージ同期', () => {
    it('should sync with storage changes from other tabs', async () => {
      const { result } = renderHook(() => useUserNGListExtended())
      
      const newList: ExtendedUserNGList = {
        videoIds: ['sm3'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['音楽'], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] }
        },
        version: 2,
        totalCount: 2,
        updatedAt: new Date().toISOString()
      }
      
      // 他のタブからの変更をシミュレート
      await act(async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newList))
        const event = new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify(newList),
          oldValue: null,
          storageArea: localStorage
        })
        window.dispatchEvent(event)
      })

      await waitFor(() => {
        expect(result.current.ngList).toEqual(expect.objectContaining({
          videoIds: ['sm3']
        }))
      })
    })
    
    it('should sync with ngListUpdated events', async () => {
      const { result } = renderHook(() => useUserNGListExtended())
      
      const newList: ExtendedUserNGList = {
        ...result.current.ngList,
        tags: {
          locked: { exact: [], partial: [] },
          user: { exact: ['カバー'], partial: [] },
          both: { exact: [], partial: [] }
        }
      }
      
      await act(async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newList))
        window.dispatchEvent(new CustomEvent('ngListUpdated', {
          detail: { ngList: newList }
        }))
      })

      await waitFor(() => {
        expect(result.current.ngList.tags?.user.exact).toEqual(['カバー'])
      })
    })
  })

  describe('総数計算', () => {
    it('should calculate total count including tags', () => {
      const { result } = renderHook(() => useUserNGListExtended())
      
      const listWithTags: ExtendedUserNGList = {
        videoIds: ['sm1', 'sm2'], // 2
        videoTitles: { exact: ['T1'], partial: ['T2', 'T3'] }, // 3
        authorIds: ['a1'], // 1
        authorNames: { exact: [], partial: ['A1'] }, // 1
        tags: {
          locked: { exact: ['L1', 'L2'], partial: ['L3'] }, // 3
          user: { exact: ['U1'], partial: [] }, // 1
          both: { exact: [], partial: ['B1', 'B2'] } // 2
        },
        version: 2,
        totalCount: 0,
        updatedAt: ''
      }
      
      act(() => {
        result.current.saveNGListDirectly(listWithTags)
      })
      
      expect(result.current.ngList.totalCount).toBe(13)
    })
  })
})
