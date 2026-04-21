import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DerivedNGList } from '@/app/admin/ng-settings/components/DerivedNGList'

const mockUseVideoInfo = vi.fn()

vi.mock('@/app/admin/ng-settings/hooks/useVideoInfo', () => ({
  useVideoInfo: (...args: unknown[]) => mockUseVideoInfo(...args)
}))

global.fetch = vi.fn()
global.alert = vi.fn()

describe('DerivedNGList', () => {
  const mockVideoIds = ['sm12345', 'sm67890', 'sm11111']

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoInfo.mockReturnValue({
      videoInfo: {
        sm12345: { title: 'テスト動画1', authorName: 'テストユーザー1' },
        sm67890: { title: 'テスト動画2', authorName: 'テストユーザー2' },
        sm11111: { title: '削除された動画', authorName: null, isDeleted: true }
      },
      isLoading: false,
      error: null
    })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ videoIds: ['sm67890', 'sm11111'] })
    } as Response)
  })

  it('件数と動画 ID を表示する', () => {
    render(<DerivedNGList initialData={mockVideoIds} />)

    expect(screen.getByText('派生NGリスト（3件）')).toBeInTheDocument()
    expect(screen.getByText('sm12345')).toBeInTheDocument()
    expect(screen.getByText('sm67890')).toBeInTheDocument()
    expect(screen.getByText('sm11111')).toBeInTheDocument()
  })

  it('video info を表示する', () => {
    render(<DerivedNGList initialData={mockVideoIds} />)

    expect(screen.getByText('テスト動画1')).toBeInTheDocument()
    expect(screen.getByText('テストユーザー1')).toBeInTheDocument()
    expect(screen.getByText('テスト動画2')).toBeInTheDocument()
    expect(screen.getByText('テストユーザー2')).toBeInTheDocument()
    expect(screen.getByText('削除された動画')).toBeInTheDocument()
  })

  it('個別削除で confirm が false なら削除しない', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<DerivedNGList initialData={mockVideoIds} />)
    fireEvent.click(screen.getAllByRole('button', { name: /削除/ })[0])

    expect(confirmSpy).toHaveBeenCalledWith('sm12345 をNGリストから削除しますか？')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('個別削除で confirm が true なら同期まで進む', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/admin/ng-list/derived/sm12345') {
        return {
          ok: true,
          json: async () => ({ success: true })
        } as Response
      }
      if (url === '/api/admin/ng-list/derived') {
        return {
          ok: true,
          json: async () => ({ videoIds: ['sm67890', 'sm11111'] })
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const onUpdate = vi.fn()
    render(<DerivedNGList initialData={mockVideoIds} onUpdate={onUpdate} />)
    fireEvent.click(screen.getAllByRole('button', { name: /削除/ })[0])

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/ng-list/derived/sm12345',
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(onUpdate).toHaveBeenCalledWith(['sm67890', 'sm11111'])
    })
  })

  it('検索で空になったら empty state を出す', async () => {
    render(<DerivedNGList initialData={mockVideoIds} />)

    fireEvent.change(screen.getByPlaceholderText('動画ID・タイトルで検索'), {
      target: { value: 'no-match' }
    })

    await waitFor(() => {
      expect(screen.getByText('該当する動画がありません')).toBeInTheDocument()
    })
  })
})
