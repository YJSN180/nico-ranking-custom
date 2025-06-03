import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'
import type { RankingItem } from '@/types/ranking'

// モックデータ生成
const createMockItem = (id: string, page: number) => ({
  rank: 0,
  id,
  title: `動画${id}`,
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1000,
  comments: 10,
  mylists: 5,
  likes: 100,
  tags: ['タグ1', 'タグ2'],
  authorId: 'author1',
  authorName: '投稿者',
  authorIcon: 'https://example.com/icon.jpg',
  registeredAt: '2024-01-01T00:00:00Z'
})

// scrapeRankingPageのモックを作成（重複データを含む）
vi.mock('@/lib/scraper')

// filterRankingDataのモック（そのまま返す）
vi.mock('@/lib/ng-filter')

describe('タグ別ランキングの重複排除', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('複数ページから取得したデータの重複を正しく排除する', async () => {
    // モックの設定：3ページに渡って重複を含むデータを返す
    const mockScrapeRankingPage = vi.mocked(scrapeRankingPage)
    const mockFilterRankingData = vi.mocked(filterRankingData)
    mockFilterRankingData.mockImplementation(async ({ items }) => Promise.resolve({ items, popularTags: [] }))
    
    // ページ1: video1-video90（90件）
    mockScrapeRankingPage.mockResolvedValueOnce({
      items: Array.from({ length: 90 }, (_, i) => createMockItem(`video${i + 1}`, 1)),
      popularTags: ['タグA', 'タグB']
    })
    
    // ページ2: video80-video169（90件、video80-90は重複）
    mockScrapeRankingPage.mockResolvedValueOnce({
      items: Array.from({ length: 90 }, (_, i) => createMockItem(`video${i + 80}`, 2)),
      popularTags: ['タグA', 'タグB']
    })
    
    // ページ3: video150-video239（90件、video150-169は重複）
    mockScrapeRankingPage.mockResolvedValueOnce({
      items: Array.from({ length: 90 }, (_, i) => createMockItem(`video${i + 150}`, 3)),
      popularTags: ['タグA', 'タグB']
    })
    
    // 余分なページアクセス用
    mockScrapeRankingPage.mockResolvedValue({
      items: [],
      popularTags: []
    })

    // 実際のcronジョブのロジックを再現
    const targetCount = 300
    const allTagItems: any[] = []
    const seenVideoIds = new Set<string>()
    let tagPage = 1
    const maxTagPages = 8

    while (allTagItems.length < targetCount && tagPage <= maxTagPages) {
      const result = await scrapeRankingPage('other', '24h', 'タグA', 100, tagPage)
      const pageTagItems = result.items || []
      const { items: filteredTagItems } = await filterRankingData({ items: pageTagItems as RankingItem[] })
      
      // 重複を除外しながら追加
      for (const item of filteredTagItems) {
        if (!seenVideoIds.has(item.id)) {
          seenVideoIds.add(item.id)
          allTagItems.push(item)
        }
      }
      
      tagPage++
    }

    // 検証
    expect(allTagItems.length).toBe(239) // video1-video239の239件（重複なし）
    expect(seenVideoIds.size).toBe(239)
    
    // 重複がないことを確認
    const uniqueIds = new Set(allTagItems.map(item => item.id))
    expect(uniqueIds.size).toBe(allTagItems.length)
    
    // すべてのIDが期待通りか確認
    for (let i = 1; i <= 239; i++) {
      expect(seenVideoIds.has(`video${i}`)).toBe(true)
    }
  })

  it('300件に到達するまで必要なページ数を取得する', async () => {
    const mockScrapeRankingPage = vi.mocked(scrapeRankingPage)
    const mockFilterRankingData = vi.mocked(filterRankingData)
    mockFilterRankingData.mockImplementation(async ({ items }) => Promise.resolve({ items, popularTags: [] }))
    
    // ページごとに85件のユニークデータを返す（NGフィルタリング後を想定）
    for (let page = 1; page <= 4; page++) {
      const startId = (page - 1) * 85 + 1
      mockScrapeRankingPage.mockResolvedValueOnce({
        items: Array.from({ length: 85 }, (_, i) => createMockItem(`video${startId + i}`, page)),
        popularTags: ['タグA', 'タグB']
      })
    }
    
    // 余分なページアクセス用
    mockScrapeRankingPage.mockResolvedValue({
      items: [],
      popularTags: []
    })

    // 実際のcronジョブのロジックを再現
    const targetCount = 300
    const allTagItems: any[] = []
    const seenVideoIds = new Set<string>()
    let tagPage = 1
    const maxTagPages = 8

    while (allTagItems.length < targetCount && tagPage <= maxTagPages) {
      const result = await scrapeRankingPage('other', '24h', 'タグA', 100, tagPage)
      const pageTagItems = result.items || []
      const { items: filteredTagItems } = await filterRankingData({ items: pageTagItems as RankingItem[] })
      
      // 重複を除外しながら追加
      for (const item of filteredTagItems) {
        if (!seenVideoIds.has(item.id)) {
          seenVideoIds.add(item.id)
          allTagItems.push(item)
        }
      }
      
      tagPage++
    }

    // 300件に切り詰める処理を追加（実際のcronジョブと同じ）
    const finalItems = allTagItems.slice(0, targetCount)

    // 4ページ目で300件を超えるはず（85 * 4 = 340）
    expect(tagPage).toBe(5) // 4ページ処理後、5になっている
    expect(finalItems.length).toBe(300) // 300件に切り詰められている
  })

  it('最大ページ数に達した場合は処理を停止する', async () => {
    const mockScrapeRankingPage = vi.mocked(scrapeRankingPage)
    const mockFilterRankingData = vi.mocked(filterRankingData)
    mockFilterRankingData.mockImplementation(async ({ items }) => Promise.resolve({ items, popularTags: [] }))
    
    // 各ページで30件しか返さない（NGフィルタリングで大幅に減った想定）
    mockScrapeRankingPage.mockImplementation(async (genre, period, tag, limit, page) => {
      const pageNum = page ?? 1
      if (pageNum > 8) {
        return { items: [], popularTags: [] }
      }
      const startId = (pageNum - 1) * 30 + 1
      return {
        items: Array.from({ length: 30 }, (_, i) => createMockItem(`video${startId + i}`, pageNum)),
        popularTags: ['タグA', 'タグB']
      }
    })

    // 実際のcronジョブのロジックを再現
    const targetCount = 300
    const allTagItems: any[] = []
    const seenVideoIds = new Set<string>()
    let tagPage = 1
    const maxTagPages = 8

    while (allTagItems.length < targetCount && tagPage <= maxTagPages) {
      const result = await scrapeRankingPage('other', '24h', 'タグA', 100, tagPage)
      const pageTagItems = result.items || []
      const { items: filteredTagItems } = await filterRankingData({ items: pageTagItems as RankingItem[] })
      
      // 重複を除外しながら追加
      for (const item of filteredTagItems) {
        if (!seenVideoIds.has(item.id)) {
          seenVideoIds.add(item.id)
          allTagItems.push(item)
        }
      }
      
      tagPage++
    }

    // 8ページ処理しても240件しか取得できない
    expect(tagPage).toBe(9) // 8ページ処理後、9になっている
    expect(allTagItems.length).toBe(240) // 30 * 8 = 240件
  })
})