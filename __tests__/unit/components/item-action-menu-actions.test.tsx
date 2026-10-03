import React from 'react'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ItemActionMenu } from '@/components/item-action-menu'
import { saveVideoThumbnail } from '@/lib/save-video-thumbnail'
import { showToast } from '@/lib/toast'

vi.mock('@/lib/save-video-thumbnail', () => ({ saveVideoThumbnail: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
const video = {
  id: 'sm123',
  rank: 4,
  title: 'タイトル',
  thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/123/123',
  views: 1,
}
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
function openMenu() {
  render(<ItemActionMenu video={video} />)
  fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))
}
describe('video action menu', () => {
  it('downloads only on demand, blocks repeat clicks while pending, and closes after success', async () => {
    let finish!: () => void
    vi.mocked(saveVideoThumbnail).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    openMenu()
    expect(saveVideoThumbnail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'サムネイルを保存' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '画像を取得中…' }))
    expect(saveVideoThumbnail).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(showToast).toHaveBeenCalledWith(
      'ダウンロードを開始しました',
      'success',
    )
  })
  it('keeps the menu usable and offers retry when image retrieval fails', async () => {
    vi.mocked(saveVideoThumbnail).mockRejectedValue(new Error('unavailable'))
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'サムネイルを保存' }))
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('画像を取得できません'),
        'error',
      ),
    )
    expect(
      screen.getByRole('menuitem', { name: 'サムネイルを保存' }),
    ).toHaveAttribute('aria-disabled', 'false')
  })
  it('copies the video URL without opening the video', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const open = vi.spyOn(window, 'open')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'URLをコピー' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(writeText).toHaveBeenCalledWith(
      'https://www.nicovideo.jp/watch/sm123',
    )
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })
})

describe('menu motion lifecycle', () => {
  it('reopening during exit cancels the pending close', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    render(<ItemActionMenu video={video} />)
    const trigger = screen.getByRole('button', { name: 'その他の操作' })
    fireEvent.click(trigger, { detail: 1 })
    fireEvent.click(trigger, { detail: 1 })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger, { detail: 1 })
    vi.advanceTimersByTime(300)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it('reduced motion closes immediately without leaving an exiting menu', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    render(<ItemActionMenu video={video} />)
    const trigger = screen.getByRole('button', { name: 'その他の操作' })
    fireEvent.click(trigger, { detail: 1 })
    fireEvent.click(trigger, { detail: 1 })
    expect(document.querySelector('.item-action-menu__dropdown')).toBeNull()
    vi.restoreAllMocks()
  })
})
