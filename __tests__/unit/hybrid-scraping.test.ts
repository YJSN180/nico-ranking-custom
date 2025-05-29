import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeRankingPage } from '@/lib/scraper'

// モック設定
vi.mock('@/lib/scraper', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scraper')>('@/lib/scraper')
  
  return {
    ...actual,
    // scrapeWebRanking関数をエクスポート（テスト用）
    scrapeWebRanking: vi.fn(),
    mergeRankingData: vi.fn(),
    enrichMissingVideos: vi.fn()
  }
})

describe('Hybrid Scraping for Sensitive Videos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should use web scraping fallback when nvapi returns fewer items', async () => {
    // nvAPIレスポンスのモック（センシティブ動画が欠けている）
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: Array(98).fill(null).map((_, i) => ({
          id: `sm${1000 + i}`,
          title: `Video ${i + 1}`,
          thumbnail: { url: `https://example.com/thumb${i}.jpg` },
          count: { view: 1000 + i * 100 }
        }))
      }
    }

    // Webスクレイピングレスポンスのモック（100件、センシティブ動画含む）
    const webScrapingItems = [
      ...Array(98).fill(null).map((_, i) => ({
        rank: i + 1,
        id: `sm${1000 + i}`,
        title: `Video ${i + 1}`,
        thumbURL: `https://example.com/thumb${i}.jpg`,
        views: 1000 + i * 100
      })),
      {
        rank: 99,
        id: 'sm44197856',
        title: '機動戦士Gundam G糞uuuuuuX(ジークソクス)OP Ksodva',
        thumbURL: 'https://example.com/gundam.jpg',
        views: 50000
      },
      {
        rank: 100,
        id: 'sm44205605',
        title: '静電気ドッキリを仕掛けるタクヤさん',
        thumbURL: 'https://example.com/static.jpg',
        views: 45000
      }
    ]

    // fetchモックの設定
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => nvapiResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => generateMockHTML(webScrapingItems)
      } as Response)

    // テスト実行
    const result = await scrapeRankingPage('other', '24h')

    // 検証
    expect(result.items.length).toBe(100) // Webスクレイピングの結果を使用
    
    // センシティブ動画が含まれていることを確認
    const gundamVideo = result.items.find(item => item.id === 'sm44197856')
    const staticVideo = result.items.find(item => item.id === 'sm44205605')
    
    expect(gundamVideo).toBeDefined()
    expect(gundamVideo?.title).toContain('Gundam')
    expect(staticVideo).toBeDefined()
    expect(staticVideo?.title).toContain('静電気')
  })

  it('should not use web scraping for tag-filtered rankings', async () => {
    // タグフィルタリングされたランキングの場合
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: Array(50).fill(null).map((_, i) => ({
          id: `sm${2000 + i}`,
          title: `Tagged Video ${i + 1}`,
          thumbnail: { url: `https://example.com/thumb${i}.jpg` },
          count: { view: 2000 + i * 100 }
        }))
      }
    }

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => nvapiResponse
    } as Response)

    // テスト実行（タグ付き）
    const result = await scrapeRankingPage('vocaloid', '24h', '初音ミク')

    // 検証: Webスクレイピングは呼ばれない
    expect(fetch).toHaveBeenCalledTimes(1) // nvAPIのみ
    expect(result.items.length).toBe(50)
  })

  it('should handle web scraping failure gracefully', async () => {
    // nvAPIレスポンス
    const nvapiResponse = {
      meta: { status: 200 },
      data: {
        items: Array(98).fill(null).map((_, i) => ({
          id: `sm${3000 + i}`,
          title: `Video ${i + 1}`,
          thumbnail: { url: `https://example.com/thumb${i}.jpg` },
          count: { view: 3000 + i * 100 }
        }))
      }
    }

    // fetchモックの設定（Webスクレイピングが失敗）
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => nvapiResponse
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503
      } as Response)

    // テスト実行
    const result = await scrapeRankingPage('other', '24h')

    // 検証: nvAPIの結果を使用
    expect(result.items.length).toBe(98)
  })
})

// HTMLモックを生成するヘルパー関数
function generateMockHTML(items: any[]): string {
  const videoHTML = items.map(item => `
    <div class="RankingVideo">
      <a href="/watch/${item.id}">
        <img alt="${item.title}" src="${item.thumbURL}">
      </a>
      <span class="VideoMetaCount--view">${item.views.toLocaleString()}再生</span>
    </div>
  `).join('')
  
  return `
    <!DOCTYPE html>
    <html>
      <body>
        <div class="RankingContainer">
          ${videoHTML}
        </div>
      </body>
    </html>
  `
}