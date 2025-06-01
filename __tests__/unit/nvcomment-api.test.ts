import { describe, test, expect, vi, beforeEach } from 'vitest'
import { fetchLatestComment } from '@/lib/nvcomment-api'

// fetchのモック
global.fetch = vi.fn()

describe('nvComment API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('動画の最新コメントを取得できる', async () => {
    const videoId = 'sm12345'
    
    // 動画ページのモック
    const mockHTML = `
      <html>
        <head>
          <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;comment&quot;:{&quot;nvComment&quot;:{&quot;threadKey&quot;:&quot;test-key&quot;,&quot;server&quot;:&quot;https://public.nvcomment.nicovideo.jp&quot;,&quot;params&quot;:{&quot;targets&quot;:[{&quot;id&quot;:&quot;1234567&quot;,&quot;fork&quot;:&quot;main&quot;}]}}}}}}">
        </head>
      </html>
    `
    
    // コメントAPIのレスポンス
    const mockCommentResponse = JSON.stringify({
      meta: { status: 200 },
      data: {
        threads: [
          {
            id: '1234567',
            fork: 'main',
            comments: [
              { body: '古いコメント', postedAt: '2025-01-01T00:00:00+09:00' },
              { body: '最新のコメント', postedAt: '2025-01-01T12:00:00+09:00' }
            ]
          }
        ]
      }
    })
    
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => mockCommentResponse
      } as Response)
    
    const result = await fetchLatestComment(videoId)
    
    expect(result).toEqual({
      body: '最新のコメント',
      postedAt: '2025-01-01T12:00:00+09:00'
    })
    
    // 正しいURLが呼ばれたか確認
    expect(fetch).toHaveBeenCalledWith(
      `https://www.nicovideo.jp/watch/${videoId}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Googlebot')
        })
      })
    )
    
    expect(fetch).toHaveBeenCalledWith(
      'https://public.nvcomment.nicovideo.jp/v1/threads',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    )
  })

  test('コメントがない場合はundefinedを返す', async () => {
    const mockHTML = `
      <html>
        <head>
          <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;comment&quot;:{&quot;nvComment&quot;:{&quot;threadKey&quot;:&quot;test-key&quot;,&quot;params&quot;:{&quot;targets&quot;:[{&quot;id&quot;:&quot;1234567&quot;}]}}}}}}">
        </head>
      </html>
    `
    
    const mockCommentResponse = JSON.stringify({
      meta: { status: 200 },
      data: {
        threads: [
          {
            id: '1234567',
            fork: 'main',
            comments: []
          }
        ]
      }
    })
    
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => mockCommentResponse
      } as Response)
    
    const result = await fetchLatestComment('sm12345')
    
    expect(result).toBeUndefined()
  })

  test('エラー時はundefinedを返す', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))
    
    const result = await fetchLatestComment('sm12345')
    
    expect(result).toBeUndefined()
  })

  test('複数の動画の最新コメントを並列で取得できる', async () => {
    const videoIds = ['sm1', 'sm2', 'sm3']
    
    // fetchの実装をカスタマイズして、URLベースで適切なレスポンスを返す
    vi.mocked(fetch).mockImplementation(async (url: string | URL, options?: any) => {
      const urlStr = url.toString()
      
      // 動画IDを抽出
      let videoId: string | null = null
      if (urlStr.includes('/watch/')) {
        const match = urlStr.match(/\/watch\/([^?]+)/)
        videoId = match ? match[1] : null
      }
      
      // HTMLレスポンスの場合
      if (urlStr.includes('/watch/')) {
        const index = videoIds.indexOf(videoId || '')
        if (index >= 0) {
          const mockHTML = `
            <html>
              <head>
                <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;comment&quot;:{&quot;nvComment&quot;:{&quot;threadKey&quot;:&quot;key${index}&quot;,&quot;params&quot;:{&quot;targets&quot;:[{&quot;id&quot;:&quot;thread${index}&quot;}]}}}}}}">
              </head>
            </html>
          `
          return {
            ok: true,
            text: async () => mockHTML
          } as Response
        }
      }
      
      // nvComment APIレスポンスの場合（POSTリクエスト）
      if (urlStr.includes('/v1/threads') && options?.method === 'POST') {
        // リクエストボディからthreadKeyを抽出
        const body = JSON.parse(options.body)
        const match = body.threadKey?.match(/key(\d+)/)
        const index = match ? parseInt(match[1]) : -1
        
        if (index >= 0) {
          const mockCommentResponse = JSON.stringify({
            meta: { status: 200 },
            data: {
              threads: [{
                id: `thread${index}`,
                fork: 'main',
                comments: [{
                  body: `コメント${index}`,
                  postedAt: `2025-01-01T0${index}:00:00+09:00`
                }]
              }]
            }
          })
          return {
            ok: true,
            text: async () => mockCommentResponse
          } as Response
        }
      }
      
      // デフォルトレスポンス
      return {
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      } as Response
    })
    
    // 並列実行をシミュレート
    const { fetchLatestComments } = await import('@/lib/nvcomment-api')
    const results = await fetchLatestComments(videoIds)
    
    expect(results).toEqual({
      sm1: { body: 'コメント0', postedAt: '2025-01-01T00:00:00+09:00' },
      sm2: { body: 'コメント1', postedAt: '2025-01-01T01:00:00+09:00' },
      sm3: { body: 'コメント2', postedAt: '2025-01-01T02:00:00+09:00' }
    })
  })
})