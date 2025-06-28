import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OptimizedImage } from '@/components/optimized-image'
import { MylistDetailClient } from '@/app/mylists/[id]/mylist-detail-client'
import { useParams, useRouter } from 'next/navigation'

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

vi.mock('@/lib/storage/mylists', () => ({
  MylistManager: vi.fn().mockImplementation(() => ({
    getMylist: vi.fn().mockResolvedValue({
      id: 'test-mylist',
      name: 'テストマイリスト',
      description: 'テスト用',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoCount: 1
    }),
    getVideosInMylist: vi.fn().mockResolvedValue([{
      id: 'sm12345',
      mylistId: 'test-mylist',
      title: '削除された動画',
      thumbURL: 'https://example.com/deleted-thumb.jpg',
      addedAt: Date.now(),
      views: 1000,
      comments: 10,
      likes: 50,
      authorName: 'テスト投稿者',
      authorId: '123456'
    }]),
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
    })

    it('削除済み動画のタイトルに（削除済み）バッジが表示される', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 動画サムネイルを取得してエラーを発生させる
      const img = screen.getByRole('img', { name: '削除された動画' })
      fireEvent.error(img)

      // 削除済みバッジが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText('（削除済み）')).toBeInTheDocument()
      })
    })

    it('削除済み動画はリンクがクリックできない', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 初期状態ではリンクが存在する
      const initialLink = screen.getByTestId('video-title')
      expect(initialLink.tagName).toBe('A')

      // 動画サムネイルを取得してエラーを発生させる
      const img = screen.getByRole('img', { name: '削除された動画' })
      fireEvent.error(img)

      // リンクがspanに変わることを確認
      await waitFor(() => {
        expect(screen.queryByTestId('video-title')).not.toBeInTheDocument()
        expect(screen.getByText('削除された動画')).toBeInTheDocument()
      })
    })

    it('削除済み動画には削除メッセージが表示される', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 動画サムネイルを取得してエラーを発生させる
      const img = screen.getByRole('img', { name: '削除された動画' })
      fireEvent.error(img)

      // 削除メッセージが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText('この動画は削除されたか、非公開になっています')).toBeInTheDocument()
      })
    })

    it('削除済み動画の投稿者情報は表示されない', async () => {
      render(<MylistDetailClient />)

      // コンポーネントの初期化を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
      })

      // 初期状態では投稿者情報が表示される
      expect(screen.getByText('テスト投稿者')).toBeInTheDocument()

      // 動画サムネイルを取得してエラーを発生させる
      const img = screen.getByRole('img', { name: '削除された動画' })
      fireEvent.error(img)

      // 投稿者情報が非表示になることを確認
      await waitFor(() => {
        expect(screen.queryByText('テスト投稿者')).not.toBeInTheDocument()
      })
    })
  })
})