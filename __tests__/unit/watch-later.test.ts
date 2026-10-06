import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import {
  WATCH_LATER_STORAGE_KEY,
  addWatchLaterItem,
  clearWatchLaterItems,
  markWatchLaterItemOpened,
  readWatchLaterItems,
  removeWatchLaterItem,
} from '@/lib/watch-later'

const video: RankingItem = {
  id: 'sm12345',
  title: 'テスト動画',
  thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345.jpg',
  rank: 1,
  views: 100,
  comments: 10,
  mylists: 5,
  likes: 20,
  authorName: '投稿者',
}

describe('watch-later storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-20T01:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a ranking item with source context', () => {
    const result = addWatchLaterItem(video, {
      genre: 'game',
      period: '24h',
      tag: '実況',
    })

    expect(result.added).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.item).toMatchObject({
      id: 'sm12345',
      title: 'テスト動画',
      url: 'https://www.nicovideo.jp/watch/sm12345',
      sourceGenre: 'game',
      sourcePeriod: '24h',
      sourceTag: '実況',
      addedAt: '2026-05-20T01:00:00.000Z',
    })
  })

  it('deduplicates by video id', () => {
    addWatchLaterItem(video)
    const second = addWatchLaterItem({ ...video, title: '別タイトル' })

    expect(second.added).toBe(false)
    expect(readWatchLaterItems()).toHaveLength(1)
    expect(readWatchLaterItems()[0].title).toBe('テスト動画')
  })

  it('removes, clears, and marks opened items', () => {
    addWatchLaterItem(video)
    markWatchLaterItemOpened(video.id)
    expect(readWatchLaterItems()[0].openedAt).toBe('2026-05-20T01:00:00.000Z')

    removeWatchLaterItem(video.id)
    expect(readWatchLaterItems()).toEqual([])

    addWatchLaterItem(video)
    clearWatchLaterItems()
    expect(window.localStorage.getItem(WATCH_LATER_STORAGE_KEY)).toBe('[]')
  })
})
