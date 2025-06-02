import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUserNGList } from '@/hooks/use-user-ng-list'

// localStorageのモック
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('useUserNGList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorageMock.clear()
  })

  it('初回読み込み時に空のNGリストを返す', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserNGList())

    expect(result.current.ngList).toEqual({
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: [],
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: [],
      },
      version: 1,
      totalCount: 0,
      updatedAt: expect.any(String),
    })
  })

  it('動画IDを追加できる', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.addVideoId('sm12345678')
    })

    expect(result.current.ngList.videoIds).toContain('sm12345678')
    expect(result.current.ngList.totalCount).toBe(1)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'user-ng-list',
      expect.stringContaining('"sm12345678"')
    )
  })

  it('重複する動画IDは追加されない', () => {
    const initial = {
      videoIds: ['sm12345678'],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(initial))

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.addVideoId('sm12345678')
    })

    expect(result.current.ngList.videoIds).toHaveLength(1)
    expect(result.current.ngList.totalCount).toBe(1)
  })

  it('動画タイトル（部分一致）を追加できる', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.addVideoTitle('歌ってみた', 'partial')
    })

    expect(result.current.ngList.videoTitles.partial).toContain('歌ってみた')
    expect(result.current.ngList.totalCount).toBe(1)
  })

  it('動画タイトル（完全一致）を追加できる', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.addVideoTitle('特定のタイトル', 'exact')
    })

    expect(result.current.ngList.videoTitles.exact).toContain('特定のタイトル')
    expect(result.current.ngList.totalCount).toBe(1)
  })

  it('投稿者IDを追加できる', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.addAuthorId('12345')
    })

    expect(result.current.ngList.authorIds).toContain('12345')
    expect(result.current.ngList.totalCount).toBe(1)
  })

  it('投稿者名（完全一致）を追加できる', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.addAuthorName('特定の投稿者', 'exact')
    })

    expect(result.current.ngList.authorNames.exact).toContain('特定の投稿者')
    expect(result.current.ngList.totalCount).toBe(1)
  })

  it('投稿者名（部分一致）を追加できる', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.addAuthorName('bot', 'partial')
    })

    expect(result.current.ngList.authorNames.partial).toContain('bot')
    expect(result.current.ngList.totalCount).toBe(1)
  })

  it('削除機能が正しく動作する', () => {
    const initial = {
      videoIds: ['sm12345678', 'sm87654321'],
      videoTitles: { exact: ['タイトル1'], partial: ['部分'] },
      authorIds: ['12345'],
      authorNames: { exact: ['投稿者1'], partial: ['bot'] },
      version: 1,
      totalCount: 7, // 2 + 1 + 1 + 1 + 1 + 1 = 7
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(initial))

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.removeVideoId('sm12345678')
    })

    expect(result.current.ngList.videoIds).not.toContain('sm12345678')
    expect(result.current.ngList.totalCount).toBe(6)
  })

  it('フィルタリング関数が正しく動作する', () => {
    const initial = {
      videoIds: ['sm12345678'],
      videoTitles: { exact: ['削除する動画'], partial: ['歌ってみた'] },
      authorIds: ['99999'],
      authorNames: { exact: ['NGユーザー'], partial: ['bot'] },
      version: 1,
      totalCount: 5,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(initial))

    const { result } = renderHook(() => useUserNGList())

    const items = [
      { id: 'sm12345678', title: '何か', authorId: '1', authorName: 'user1' },
      { id: 'sm22222222', title: '削除する動画', authorId: '2', authorName: 'user2' },
      { id: 'sm33333333', title: '歌ってみた動画', authorId: '3', authorName: 'user3' },
      { id: 'sm44444444', title: '通常動画', authorId: '99999', authorName: 'other' },
      { id: 'sm55555555', title: '通常動画2', authorId: '5', authorName: 'NGユーザー' },
      { id: 'sm66666666', title: '通常動画3', authorId: '6', authorName: 'testbot' },
      { id: 'sm77777777', title: '残る動画', authorId: '7', authorName: 'normaluser' },
    ]

    const filtered = result.current.filterItems(items)

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('sm77777777')
  })

  it('NGリストをリセットできる', () => {
    const initial = {
      videoIds: ['sm12345678'],
      videoTitles: { exact: ['タイトル'], partial: ['部分'] },
      authorIds: ['12345'],
      authorNames: { exact: ['投稿者'], partial: ['bot'] },
      version: 1,
      totalCount: 5,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(initial))

    const { result } = renderHook(() => useUserNGList())

    act(() => {
      result.current.resetNGList()
    })

    expect(result.current.ngList.videoIds).toHaveLength(0)
    expect(result.current.ngList.totalCount).toBe(0)
  })
})