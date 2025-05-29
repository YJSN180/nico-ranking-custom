import { describe, it, expect, vi, beforeEach } from 'vitest'
import { completeHybridScrape } from '@/lib/complete-hybrid-scraper'

// fetchのモック
global.fetch = vi.fn()

describe('Complete Hybrid Scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch all videos including sensitive ones', async () => {
    // nvAPIレスポンス（センシティブ動画が欠けている）
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: [
          {
            id: 'sm1001',
            title: 'Normal Video 1',
            thumbnail: { largeUrl: 'https://example.com/thumb1.jpg' },
            count: { view: 1000, comment: 100, mylist: 50, like: 200 },
            owner: { id: 'user1', name: 'User One', iconUrl: 'https://example.com/user1.jpg' },
            registeredAt: '2024-01-01T00:00:00+09:00'
          },
          {
            id: 'sm1002',
            title: 'Normal Video 2',
            thumbnail: { largeUrl: 'https://example.com/thumb2.jpg' },
            count: { view: 2000, comment: 200, mylist: 100, like: 400 },
            owner: { id: 'user2', name: 'User Two', iconUrl: 'https://example.com/user2.jpg' },
            registeredAt: '2024-01-02T00:00:00+09:00'
          }
          // センシティブ動画（sm44197856, sm44205605）は含まれない
        ]
      }
    }

    // HTMLレスポンス（全動画を含む）
    const htmlResponse = `
      <div class="RankingContainer">
        <article data-video-id="sm1001">
          <a href="/watch/sm1001">
            <img alt="Normal Video 1" src="https://example.com/thumb1.jpg">
          </a>
          <span class="VideoMetaCount">1,000 再生</span>
        </article>
        <article data-video-id="sm1002">
          <a href="/watch/sm1002">
            <img alt="Normal Video 2" src="https://example.com/thumb2.jpg">
          </a>
          <span class="VideoMetaCount">2,000 再生</span>
        </article>
        <article data-video-id="sm44197856">
          <a href="/watch/sm44197856">
            <img alt="機動戦士Gundam G糞uuuuuuX(ジークソクス)OP Ksodva" src="https://example.com/gundam.jpg">
          </a>
          <span class="VideoMetaCount">50,000 再生</span>
        </article>
        <article data-video-id="sm44205605">
          <a href="/watch/sm44205605">
            <img alt="静電気ドッキリを仕掛けるタクヤさん" src="https://example.com/static.jpg">
          </a>
          <span class="VideoMetaCount">45,000 再生</span>
        </article>
      </div>
    `

    // Snapshot APIレスポンス（センシティブ動画のメタデータ）
    const snapshotResponse = {
      data: [
        {
          contentId: 'sm44197856',
          title: '機動戦士Gundam G糞uuuuuuX(ジークソクス)OP Ksodva',
          viewCounter: 50000,
          commentCounter: 500,
          mylistCounter: 250,
          likeCounter: 1000,
          thumbnailUrl: { large: 'https://example.com/gundam.jpg' },
          userId: 'user3',
          startTime: '2024-01-03T00:00:00+09:00',
          tags: 'ガンダム アニメ'
        },
        {
          contentId: 'sm44205605',
          title: '静電気ドッキリを仕掛けるタクヤさん',
          viewCounter: 45000,
          commentCounter: 450,
          mylistCounter: 225,
          likeCounter: 900,
          thumbnailUrl: { large: 'https://example.com/static.jpg' },
          userId: 'user4',
          startTime: '2024-01-04T00:00:00+09:00',
          tags: 'ドッキリ エンターテイメント'
        }
      ]
    }

    // 投稿者情報取得のレスポンス
    const authorResponse1 = {
      meta: { status: 200 },
      data: {
        owner: {
          id: 'user3',
          name: 'ガンダムファン',
          iconUrl: 'https://example.com/user3.jpg'
        }
      }
    }

    const authorResponse2 = {
      meta: { status: 200 },
      data: {
        owner: {
          id: 'user4',
          name: 'タクヤ',
          iconUrl: 'https://example.com/user4.jpg'
        }
      }
    }

    // fetchモックの設定
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => nvapiResponse,
        text: async () => JSON.stringify(nvapiResponse)
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'HTML response' }),
        text: async () => htmlResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshotResponse,
        text: async () => JSON.stringify(snapshotResponse)
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => authorResponse1,
        text: async () => JSON.stringify(authorResponse1)
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => authorResponse2,
        text: async () => JSON.stringify(authorResponse2)
      } as Response)

    // テスト実行
    const result = await completeHybridScrape('other', '24h')

    // 検証
    expect(result.items.length).toBe(4) // 全4動画
    
    // センシティブ動画が含まれていることを確認
    const gundamVideo = result.items.find(item => item.id === 'sm44197856')
    expect(gundamVideo).toBeDefined()
    expect(gundamVideo?.title).toContain('Gundam')
    expect(gundamVideo?.rank).toBe(3)
    expect(gundamVideo?.comments).toBe(500)
    expect(gundamVideo?.authorName).toBe('ガンダムファン')
    
    const staticVideo = result.items.find(item => item.id === 'sm44205605')
    expect(staticVideo).toBeDefined()
    expect(staticVideo?.title).toContain('静電気')
    expect(staticVideo?.rank).toBe(4)
    expect(staticVideo?.comments).toBe(450)
    expect(staticVideo?.authorName).toBe('タクヤ')
    
    // 通常の動画も正しく処理されていることを確認
    const normalVideo1 = result.items.find(item => item.id === 'sm1001')
    expect(normalVideo1?.authorName).toBe('User One')
    expect(normalVideo1?.authorIcon).toBe('https://example.com/user1.jpg')
  })

  it('should use nvAPI only for tag-filtered rankings', async () => {
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: [
          {
            id: 'sm2001',
            title: 'Tagged Video 1',
            thumbnail: { largeUrl: 'https://example.com/thumb1.jpg' },
            count: { view: 3000, comment: 300, mylist: 150, like: 600 },
            owner: { id: 'user5', name: 'User Five', iconUrl: 'https://example.com/user5.jpg' },
            registeredAt: '2024-01-05T00:00:00+09:00'
          }
        ]
      }
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => nvapiResponse,
      text: async () => JSON.stringify(nvapiResponse)
    } as Response)

    // タグ付きでテスト実行
    const result = await completeHybridScrape('vocaloid', '24h', '初音ミク')

    // 検証：HTMLスクレイピングは呼ばれない
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('tag=%E5%88%9D%E9%9F%B3%E3%83%9F%E3%82%AF'),
      expect.any(Object)
    )
    expect(result.items.length).toBe(1)
  })

  it('should handle errors gracefully', async () => {
    // nvAPIが失敗
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

    // エラーが投げられることを確認
    await expect(completeHybridScrape('all', '24h')).rejects.toThrow('Complete hybrid scraping failed')
  })
})