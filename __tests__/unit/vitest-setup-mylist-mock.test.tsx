import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useMylistOperations } from '@/context/mylist-operations-context'
import { MylistButton } from '@/components/mylist-button'
import type { RankingItem } from '@/types/ranking'

// vitest.setup.ts の共通モック（マイリスト操作）は、呼ぶたびに同じ参照を返すこと。
// 新しい関数を返すと、行ごとの MylistButton の effect（依存に isVideoInAnyMylist）が
// 描画のたびに再実行されて止まらず、行を長く表示するテストがメモリ不足で落ちる。

const video: RankingItem = {
  id: 'sm90000101',
  rank: 1,
  title: '合成タイトル',
  thumbURL: 'https://example.com/thumb.jpg',
  views: 100,
  comments: 1,
  mylists: 2,
  likes: 3,
}

describe('vitest.setup: マイリスト操作の共通モック', () => {
  it('呼ぶたびに同じ関数と同じ配列を返す', () => {
    const first = useMylistOperations()
    const second = useMylistOperations()

    expect(second.isVideoInAnyMylist).toBe(first.isVideoInAnyMylist)
    expect(second.addVideoToMylist).toBe(first.addVideoToMylist)
    expect(second.removeVideoFromMylist).toBe(first.removeVideoFromMylist)
    expect(second.createMylist).toBe(first.createMylist)
    expect(second.mylists).toBe(first.mylists)
  })

  it('MylistButton の登録状態の確認は 1 回で止まる', async () => {
    const { isVideoInAnyMylist } = useMylistOperations()
    render(<MylistButton video={video} />)

    await waitFor(() => expect(isVideoInAnyMylist).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(isVideoInAnyMylist).toHaveBeenCalledTimes(1)
  })

  it('resetAllMocks の後も既定の戻り値を返す', async () => {
    vi.resetAllMocks()
    const operations = useMylistOperations()

    await expect(operations.isVideoInAnyMylist(video.id)).resolves.toEqual({ inMylist: false, mylistIds: [] })
    await expect(operations.addVideoToMylist('mylist-1', video)).resolves.toBe(true)
  })
})
