import { describe, it, expect, vi, beforeEach } from 'vitest'
import { completeHybridScrape } from '@/lib/complete-hybrid-scraper'

// fetchのモック
global.fetch = vi.fn()

describe('Author Info Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch author info including icons for all videos', async () => {
    // nvAPIレスポンス（投稿者情報付き）
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: [
          {
            id: 'sm1001',
            title: 'Test Video 1',
            thumbnail: { largeUrl: 'https://example.com/thumb1.jpg' },
            count: { view: 1000, comment: 100, mylist: 50, like: 200 },
            owner: {
              id: 'user123',
              name: 'テストユーザー1',
              iconUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123.jpg'
            },
            registeredAt: '2024-01-01T00:00:00+09:00'
          },
          {
            id: 'sm1002',
            title: 'Test Video 2',
            thumbnail: { largeUrl: 'https://example.com/thumb2.jpg' },
            count: { view: 2000, comment: 200, mylist: 100, like: 400 },
            owner: {
              id: 'channel/ch456',
              name: 'テストチャンネル',
              iconUrl: 'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch456.jpg'
            },
            registeredAt: '2024-01-02T00:00:00+09:00'
          }
        ]
      }
    }

    // タグ付きランキングのテスト（nvAPIのみ使用）
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => nvapiResponse,
      text: async () => JSON.stringify(nvapiResponse)
    } as Response)

    const result = await completeHybridScrape('vocaloid', '24h', 'VOCALOID')

    // 検証
    expect(result.items.length).toBe(2)
    
    // 投稿者情報が正しく取得されていることを確認
    const item1 = result.items[0]
    expect(item1?.authorId).toBe('user123')
    expect(item1?.authorName).toBe('テストユーザー1')
    expect(item1?.authorIcon).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123.jpg')
    
    const item2 = result.items[1]
    expect(item2?.authorId).toBe('channel/ch456')
    expect(item2?.authorName).toBe('テストチャンネル')
    expect(item2?.authorIcon).toBe('https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch456.jpg')
  })

  it('should fetch missing author info for sensitive videos', async () => {
    // nvAPIレスポンス（通常動画のみ）
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: [
          {
            id: 'sm1001',
            title: 'Normal Video',
            thumbnail: { largeUrl: 'https://example.com/thumb1.jpg' },
            count: { view: 1000, comment: 100, mylist: 50, like: 200 },
            owner: {
              id: 'user123',
              name: 'ユーザー1',
              iconUrl: 'https://example.com/user1.jpg'
            }
          }
        ]
      }
    }

    // HTMLレスポンス（センシティブ動画を含む）
    const htmlResponse = `
      <div>
        <article data-video-id="sm1001">
          <a href="/watch/sm1001"><img alt="Normal Video" src="https://example.com/thumb1.jpg"></a>
          <span>1,000 再生</span>
        </article>
        <article data-video-id="sm2001">
          <a href="/watch/sm2001"><img alt="Sensitive Video" src="https://example.com/sensitive.jpg"></a>
          <span>50,000 再生</span>
        </article>
      </div>
    `

    // Snapshot APIレスポンス
    const snapshotResponse = {
      data: [
        {
          contentId: 'sm2001',
          title: 'Sensitive Video',
          viewCounter: 50000,
          commentCounter: 500,
          mylistCounter: 250,
          likeCounter: 1000,
          thumbnailUrl: { large: 'https://example.com/sensitive.jpg' },
          userId: 'user999',
          startTime: '2024-01-03T00:00:00+09:00'
        }
      ]
    }

    // 個別動画情報取得のレスポンス（投稿者情報）
    const authorResponse = {
      meta: { status: 200 },
      data: {
        video: { id: 'sm2001' },
        owner: {
          id: 'user999',
          name: 'センシティブ動画の投稿者',
          iconUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/999.jpg'
        }
      }
    }

    // モックの設定
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => nvapiResponse,
        text: async () => JSON.stringify(nvapiResponse)
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'HTML' }),
        text: async () => htmlResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshotResponse,
        text: async () => JSON.stringify(snapshotResponse)
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => authorResponse,
        text: async () => JSON.stringify(authorResponse)
      } as Response)

    const result = await completeHybridScrape('other', '24h')

    // 検証
    expect(result.items.length).toBe(2)
    
    // センシティブ動画の投稿者情報が取得されていることを確認
    const sensitiveVideo = result.items.find(item => item.id === 'sm2001')
    expect(sensitiveVideo).toBeDefined()
    expect(sensitiveVideo?.authorId).toBe('user999')
    expect(sensitiveVideo?.authorName).toBe('センシティブ動画の投稿者')
    expect(sensitiveVideo?.authorIcon).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/999.jpg')
  })

  it('should handle videos without author info gracefully', async () => {
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: [
          {
            id: 'sm1001',
            title: 'Video without owner',
            thumbnail: { largeUrl: 'https://example.com/thumb1.jpg' },
            count: { view: 1000, comment: 100, mylist: 50, like: 200 },
            // owner フィールドなし
          },
          {
            id: 'sm1002',
            title: 'Video with partial owner info',
            thumbnail: { largeUrl: 'https://example.com/thumb2.jpg' },
            count: { view: 2000, comment: 200, mylist: 100, like: 400 },
            owner: {
              id: 'user456',
              name: 'ユーザー2'
              // iconUrl なし
            }
          }
        ]
      }
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => nvapiResponse,
      text: async () => JSON.stringify(nvapiResponse)
    } as Response)

    const result = await completeHybridScrape('all', '24h', 'tag')

    // 検証
    expect(result.items.length).toBe(2)
    
    // 投稿者情報がない動画も正常に処理されることを確認
    const video1 = result.items[0]
    expect(video1?.authorId).toBeUndefined()
    expect(video1?.authorName).toBeUndefined()
    expect(video1?.authorIcon).toBeUndefined()
    
    const video2 = result.items[1]
    expect(video2?.authorId).toBe('user456')
    expect(video2?.authorName).toBe('ユーザー2')
    expect(video2?.authorIcon).toBeUndefined() // アイコンはない
  })
})