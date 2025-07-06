import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { VideoContextMenu } from '@/components/video-context-menu'
import type { RankingItem } from '@/types/ranking'
import '../test-environment'

// モックデータ
const mockVideo: RankingItem = {
  id: 'sm12345',
  title: 'テスト動画',
  thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345.jpg',
  rank: 1,
  views: 1000,
  registeredAt: '2025-07-05T12:00:00Z',
  comments: 100,
  mylists: 50,
  likes: 200,
  authorName: 'テスト投稿者',
  authorId: '123456',
  authorIcon: 'https://example.com/icon.jpg',
  duration: 180,
}

// Fetch APIのモック
global.fetch = vi.fn()
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

// navigator.vibrate のモック
Object.defineProperty(navigator, 'vibrate', {
  value: vi.fn(),
  writable: true,
})

// navigator.clipboard のモック
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
})

describe('VideoContextMenu - サムネイル保存機能', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('コンテキストメニューにサムネイル保存ボタンが表示される', async () => {
    render(
      <VideoContextMenu video={mockVideo}>
        <div>テストコンテンツ</div>
      </VideoContextMenu>
    )

    // 長押しをシミュレート
    const content = screen.getByText('テストコンテンツ')
    fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] })

    // 500ms待機（長押し時間）
    await waitFor(() => {
      expect(screen.getByText('サムネイル保存')).toBeInTheDocument()
    }, { timeout: 600 })
  })

  it('サムネイルURLが既に存在する場合、大きいサイズに変換してプロキシAPI経由でダウンロードされる', async () => {
    // Blobのモック
    const mockBlob = new Blob(['mock image data'], { type: 'image/jpeg' })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
    } as Response)

    // ダウンロードリンクのクリックをモック
    const mockClick = vi.fn()
    const mockRemove = vi.fn()
    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
      remove: mockRemove,
    }
    
    // createElementの実装を保存
    const originalCreateElement = document.createElement.bind(document)
    
    // createElementをモック（aタグのみ）
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return mockAnchor as any
      }
      return originalCreateElement(tagName)
    })

    // appendChild/removeChild のモック
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any)
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any)

    render(
      <VideoContextMenu video={mockVideo}>
        <div>テストコンテンツ</div>
      </VideoContextMenu>
    )

    // メニューを開く
    const content = screen.getByText('テストコンテンツ')
    fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] })
    
    await waitFor(() => {
      expect(screen.getByText('サムネイル保存')).toBeInTheDocument()
    })

    // サムネイル保存ボタンをクリック
    const saveButton = screen.getByText('サムネイル保存')
    fireEvent.click(saveButton)

    await waitFor(() => {
      // プロキシAPIが正しいURLで呼ばれたことを確認（.Lに変換されている）
      const expectedUrl = mockVideo.thumbURL + '.L'
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/thumbnail-proxy?url=${encodeURIComponent(expectedUrl)}`
      )
      
      // ダウンロードリンクが作成され、クリックされたことを確認
      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(mockClick).toHaveBeenCalled()
      
      // 成功メッセージが表示されることを確認
      expect(screen.getByText('✓ サムネイルを保存しました')).toBeInTheDocument()
    })

    // クリーンアップ
    createElementSpy.mockRestore()
    appendChildSpy.mockRestore()
    removeChildSpy.mockRestore()
  })

  it('サムネイルURLがない場合、APIから取得される', async () => {
    const videoWithoutThumb = { ...mockVideo, thumbURL: undefined }
    
    // API レスポンスのモック
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ thumbnail: 'https://api.example.com/thumb.jpg' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['mock image data'], { type: 'image/jpeg' }),
      } as Response)

    render(
      <VideoContextMenu video={videoWithoutThumb}>
        <div>テストコンテンツ</div>
      </VideoContextMenu>
    )

    // メニューを開く
    const content = screen.getByText('テストコンテンツ')
    fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] })
    
    await waitFor(() => {
      expect(screen.getByText('サムネイル保存')).toBeInTheDocument()
    })

    // サムネイル保存ボタンをクリック
    const saveButton = screen.getByText('サムネイル保存')
    fireEvent.click(saveButton)

    await waitFor(() => {
      // APIが正しく呼ばれたことを確認
      expect(global.fetch).toHaveBeenCalledWith(`/api/hd-thumbnail/${videoWithoutThumb.id}`)
    })
  })

  it('APIエラーの場合、エラーアラートが表示される', async () => {
    const videoWithoutThumb = { ...mockVideo, thumbURL: undefined }
    
    // API エラーのモック
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
    } as Response)

    // alert のモック
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(
      <VideoContextMenu video={videoWithoutThumb}>
        <div>テストコンテンツ</div>
      </VideoContextMenu>
    )

    // メニューを開く
    const content = screen.getByText('テストコンテンツ')
    fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] })
    
    await waitFor(() => {
      expect(screen.getByText('サムネイル保存')).toBeInTheDocument()
    })

    // サムネイル保存ボタンをクリック
    const saveButton = screen.getByText('サムネイル保存')
    fireEvent.click(saveButton)

    await waitFor(() => {
      // エラーアラートが表示されることを確認
      expect(alertMock).toHaveBeenCalledWith('サムネイルの取得に失敗しました')
    })

    alertMock.mockRestore()
  })
  
  it('プロキシAPIが利用できない場合は新しいタブで画像を開く', async () => {
    // プロキシAPIがエラーを返すモック
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

    // window.open のモック
    const mockOpen = vi.fn()
    global.window.open = mockOpen

    render(
      <VideoContextMenu video={mockVideo}>
        <div>テストコンテンツ</div>
      </VideoContextMenu>
    )

    // メニューを開く
    const content = screen.getByText('テストコンテンツ')
    fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] })
    
    await waitFor(() => {
      expect(screen.getByText('サムネイル保存')).toBeInTheDocument()
    })

    // サムネイル保存ボタンをクリック
    const saveButton = screen.getByText('サムネイル保存')
    fireEvent.click(saveButton)

    await waitFor(() => {
      // window.openが呼ばれたことを確認
      expect(mockOpen).toHaveBeenCalledWith(mockVideo.thumbURL, '_blank')
      
      // 手動保存の案内メッセージが表示されることを確認
      expect(screen.getByText(/画像を開きました/)).toBeInTheDocument()
    })
  })
})