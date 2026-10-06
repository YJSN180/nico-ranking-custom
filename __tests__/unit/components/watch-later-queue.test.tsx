import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { WatchLaterQueue } from '@/components/watch-later-queue'
import {
  WATCH_LATER_STORAGE_KEY,
  addWatchLaterItem,
  readWatchLaterItems,
} from '@/lib/watch-later'
import { navigateToVideo } from '@/lib/pwa-utils'
import type { RankingItem } from '@/types/ranking'

vi.mock('@/lib/pwa-utils', () => ({
  navigateToVideo: vi.fn(),
}))

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

describe('WatchLaterQueue', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('shows count and opens the drawer with stored items', async () => {
    addWatchLaterItem(video)
    render(<WatchLaterQueue />)

    expect(
      screen.getByRole('button', { name: 'あとで見る 1件' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'あとで見る 1件' }))
    expect(
      screen.getByRole('complementary', { name: 'あとで見る' }),
    ).toBeInTheDocument()
    expect(screen.getByText('テスト動画')).toBeInTheDocument()
  })

  it('removes an item from the drawer', async () => {
    addWatchLaterItem(video)
    render(<WatchLaterQueue />)

    fireEvent.click(screen.getByRole('button', { name: 'あとで見る 1件' }))
    fireEvent.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => {
      expect(readWatchLaterItems()).toEqual([])
    })
    expect(
      screen.getByText('右クリックまたは長押しから動画を追加できます。'),
    ).toBeInTheDocument()
  })

  it('copies all URLs', async () => {
    addWatchLaterItem(video)
    render(<WatchLaterQueue />)

    fireEvent.click(screen.getByRole('button', { name: 'あとで見る 1件' }))
    fireEvent.click(screen.getByRole('button', { name: 'URLをまとめてコピー' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/watch/sm12345',
      )
    })
  })

  it('opens the top item through the shared PWA navigation helper', async () => {
    addWatchLaterItem(video)
    render(<WatchLaterQueue />)

    fireEvent.click(screen.getByRole('button', { name: 'あとで見る 1件' }))
    fireEvent.click(screen.getByRole('button', { name: '上から順に開く' }))

    await waitFor(() => {
      expect(navigateToVideo).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/watch/sm12345',
      )
    })
    expect(readWatchLaterItems()[0].openedAt).toBeTruthy()
  })

  it('syncs when storage changes in another tab', async () => {
    render(<WatchLaterQueue />)
    expect(
      screen.getByRole('button', { name: 'あとで見る 0件' }),
    ).toBeInTheDocument()

    window.localStorage.setItem(
      WATCH_LATER_STORAGE_KEY,
      JSON.stringify([
        {
          id: video.id,
          title: video.title,
          url: 'https://www.nicovideo.jp/watch/sm12345',
          addedAt: '2026-05-20T01:00:00.000Z',
        },
      ]),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: WATCH_LATER_STORAGE_KEY }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'あとで見る 1件' }),
      ).toBeInTheDocument()
    })
  })
})
