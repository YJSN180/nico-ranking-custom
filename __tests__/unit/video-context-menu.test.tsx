import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VideoContextMenu } from '@/components/video-context-menu'
import type { RankingItem } from '@/types/ranking'

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
global.fetch = jest.fn()
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = jest.fn()

// navigator.vibrate のモック
Object.defineProperty(navigator, 'vibrate', {
  value: jest.fn(),
  writable: true,
})

// navigator.clipboard のモック
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(),
  },
  writable: true,
})

describe('VideoContextMenu - サムネイル保存機能', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

  it('サムネイルURLが既に存在する場合、プロキシAPI経由でダウンロードされる', async () => {
    // Blobのモック
    const mockBlob = new Blob(['mock image data'], { type: 'image/jpeg' })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
    })

    // ダウンロードリンクのクリックをモック
    const mockClick = jest.fn()
    const mockRemove = jest.fn()
    const createElementSpy = jest.spyOn(document, 'createElement')
    createElementSpy.mockReturnValue({
      href: '',
      download: '',
      click: mockClick,
      remove: mockRemove,
    } as any)

    // appendChild/removeChild のモック
    const appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation(() => null as any)
    const removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation(() => null as any)

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
      // プロキシAPIが正しいURLで呼ばれたことを確認
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/thumbnail-proxy?url=${encodeURIComponent(mockVideo.thumbURL)}`
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
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ thumbnail: 'https://api.example.com/thumb.jpg' }),
      })
      .mockResolvedValueOnce({
        blob: async () => new Blob(['mock image data'], { type: 'image/jpeg' }),
      })

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
      expect(global.fetch).toHaveBeenCalledWith(`/api/thumbnail/${videoWithoutThumb.id}`)
    })
  })

  it('APIエラーの場合、エラーアラートが表示される', async () => {
    const videoWithoutThumb = { ...mockVideo, thumbURL: undefined }
    
    // API エラーのモック
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
    })

    // alert のモック
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {})

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
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

    // window.open のモック
    const mockOpen = jest.fn()
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