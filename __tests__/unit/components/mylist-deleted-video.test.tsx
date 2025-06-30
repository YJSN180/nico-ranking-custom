import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OptimizedImage } from '@/components/optimized-image'
import { MylistDetailClient } from '@/app/mylists/[id]/mylist-detail-client'
import { useParams, useRouter } from 'next/navigation'
import { useDeletedVideoDetection } from '@/hooks/use-deleted-video-detection'

// Next.js navigation モック
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: vi.fn()
}))

// DBManagerとMylistManagerモック
vi.mock('@/lib/storage/db-manager', () => ({
  DBManager: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(true),
    getDB: vi.fn()
  }))
}))

// 削除済み動画検出フックのモック
vi.mock('@/hooks/use-deleted-video-detection', () => ({
  useDeletedVideoDetection: vi.fn(),
  getDeletedVideoThumbnail: vi.fn().mockReturnValue('/cantwatch.jpg')
}))

vi.mock('@/lib/storage/mylists', () => ({
  MylistManager: vi.fn().mockImplementation(() => ({
    getMylist: vi.fn().mockResolvedValue({
      id: 'test-mylist',
      name: 'テストマイリスト',
      description: 'テスト用',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoCount: 3
    }),
    getVideosInMylistWithOrder: vi.fn().mockResolvedValue([
      {
        id: 'sm12345',
        mylistId: 'test-mylist',
        title: '通常の動画',
        thumbURL: 'https://example.com/thumb1.jpg',
        addedAt: Date.now(),
        authorName: 'テスト投稿者',
        authorId: '123456'
      },
      {
        id: 'sm99999',
        mylistId: 'test-mylist',
        title: '削除された動画',
        thumbURL: 'https://example.com/deleted-thumb.jpg',
        addedAt: Date.now(),
        authorName: 'テスト投稿者2',
        authorId: '789012'
      },
      {
        id: 'sm88888',
        mylistId: 'test-mylist',
        title: '動画3',
        thumbURL: 'https://example.com/thumb3.jpg',
        addedAt: Date.now(),
        authorName: 'テスト投稿者3',
        authorId: '345678'
      }
    ]),
    searchVideosInMylist: vi.fn().mockResolvedValue([])
  }))
}))

describe('削除済み動画の表示', () => {
  describe('OptimizedImage - 画像エラー時のフォールバック', () => {
    it('画像読み込みエラー時にcanwatch.jpgを表示する', async () => {
      const onError = vi.fn()
      
      const { rerender } = render(
        <OptimizedImage
          src="https://example.com/nonexistent.jpg"
          alt="テスト画像"
          width={160}
          height={90}
          onError={onError}
        />
      )

      // 画像要素を取得
      const img = screen.getByRole('img', { name: 'テスト画像' })
      
      // エラーイベントを発火
      fireEvent.error(img)

      // エラーハンドラーが呼ばれたことを確認
      expect(onError).toHaveBeenCalledTimes(1)

      // 再レンダリング後、フォールバック画像が設定されていることを確認
      await waitFor(() => {
        const updatedImg = screen.getByRole('img')
        expect(updatedImg.getAttribute('src')).toContain('cantwatch.jpg')
        expect(updatedImg.getAttribute('alt')).toBe('視聴できません')
      })
    })
  })

  describe('MylistDetailClient - 削除済み動画の表示', () => {
    beforeEach(() => {
      vi.mocked(useParams).mockReturnValue({ id: 'test-mylist' })
      vi.mocked(useRouter).mockReturnValue({
        push: vi.fn(),
        replace: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn()
      } as any)
      
      // 削除済み動画検出フックのモック設定
      vi.mocked(useDeletedVideoDetection).mockReturnValue({
        deletedVideoIds: new Set(['sm99999', 'sm88888']),
        isChecking: false,
        checkVideos: vi.fn()
      })
    })

    it('削除済み動画のタイトルに（削除済み）バッジが表示される', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 視聴できませんバッジが表示されることを確認（2つの削除済み動画）
      await waitFor(() => {
        const badges = screen.getAllByText('（視聴できません）')
        expect(badges).toHaveLength(2)
      })
    })

    it('削除済み動画はリンクがクリックできない', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 通常の動画（sm12345）はリンクが存在する
      const normalLink = screen.getAllByTestId('video-title')[0]
      expect(normalLink.tagName).toBe('A')
      expect(normalLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm12345')

      // 削除済み動画（sm99999）はリンクではなくspanタグ
      const deletedTitle = screen.getByText('削除された動画')
      expect(deletedTitle.tagName).toBe('SPAN')
      expect(deletedTitle).toHaveClass('mylist-video-item__title--deleted')
    })

    it('削除済み動画には削除メッセージが表示される', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 削除メッセージが表示されることを確認（2つの削除済み動画）
      await waitFor(() => {
        const messages = screen.getAllByText('この動画は削除されたか、非公開になっています')
        expect(messages).toHaveLength(2)
      })
    })

    it('削除済み動画の投稿者情報は表示されない', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 通常の動画（sm12345）の投稿者情報は表示される
      expect(screen.getByText('テスト投稿者')).toBeInTheDocument()

      // 削除済み動画（sm99999, sm88888）の投稿者情報は表示されない
      expect(screen.queryByText('テスト投稿者2')).not.toBeInTheDocument()
      expect(screen.queryByText('テスト投稿者3')).not.toBeInTheDocument()
    })

    it('削除済み動画のサムネイルにcantwatch.jpgが使用される', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 削除済み動画のサムネイルがcantwatch.jpgになっていることを確認
      const deletedVideoImages = screen.getAllByAltText('削除された動画')
        .concat(screen.getAllByAltText('動画3'))
        .filter(img => {
          const parent = img.closest('[data-testid="mylist-video-item"]')
          const title = parent?.querySelector('.mylist-video-item__title--deleted')
          return title !== null
        })
      
      deletedVideoImages.forEach(img => {
        expect(img).toHaveAttribute('src', '/cantwatch.jpg')
      })
    })
  })
})