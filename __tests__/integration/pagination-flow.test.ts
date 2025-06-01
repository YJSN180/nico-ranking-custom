import { describe, it, expect, beforeEach, vi } from 'vitest'
import { kv } from '@vercel/kv'

// モックデータ生成
function generateMockRankingData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    id: `sm${1000 + i}`,
    title: `テスト動画 ${i + 1}`,
    thumbURL: `https://example.com/thumb${i}.jpg`,
    views: 1000 - i * 10,
    comments: 100 - i,
    mylists: 50 - Math.floor(i / 2),
    likes: 30 - Math.floor(i / 3),
  }))
}

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  }
}))

describe('Pagination Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle 300 items from cache', async () => {
    const mockData = generateMockRankingData(300)
    vi.mocked(kv.get).mockResolvedValueOnce({
      items: mockData,
      popularTags: ['tag1', 'tag2']
    })

    // page.tsxのfetchRankingData相当の処理
    const cacheKey = 'ranking-all-24h'
    const cachedData = await kv.get(cacheKey)
    
    expect(cachedData).toBeDefined()
    expect((cachedData as any).items).toHaveLength(300)
  })

  it('should paginate correctly', () => {
    const allItems = generateMockRankingData(300)
    const ITEMS_PER_PAGE = 100
    
    // Page 1
    const page1Items = allItems.slice(0, ITEMS_PER_PAGE)
    expect(page1Items).toHaveLength(100)
    expect(page1Items[0].rank).toBe(1)
    expect(page1Items[99].rank).toBe(100)
    
    // Page 2
    const page2Items = allItems.slice(ITEMS_PER_PAGE, ITEMS_PER_PAGE * 2)
    expect(page2Items).toHaveLength(100)
    expect(page2Items[0].rank).toBe(101)
    expect(page2Items[99].rank).toBe(200)
    
    // Page 3
    const page3Items = allItems.slice(ITEMS_PER_PAGE * 2, ITEMS_PER_PAGE * 3)
    expect(page3Items).toHaveLength(100)
    expect(page3Items[0].rank).toBe(201)
    expect(page3Items[99].rank).toBe(300)
  })

  it('should handle edge cases', () => {
    const ITEMS_PER_PAGE = 100
    
    // 250 items - Page 3 should have only 50 items
    const items250 = generateMockRankingData(250)
    const page3Items = items250.slice(ITEMS_PER_PAGE * 2)
    expect(page3Items).toHaveLength(50)
    
    // 99 items - No pagination needed
    const items99 = generateMockRankingData(99)
    const totalPages = Math.ceil(items99.length / ITEMS_PER_PAGE)
    expect(totalPages).toBe(1)
    
    // 101 items - 2 pages needed
    const items101 = generateMockRankingData(101)
    const totalPages2 = Math.ceil(items101.length / ITEMS_PER_PAGE)
    expect(totalPages2).toBe(2)
  })

  it('should validate page parameter', () => {
    const validatePage = (page: string | undefined, totalPages: number) => {
      const pageNum = Number(page) || 1
      return Math.max(1, Math.min(pageNum, totalPages))
    }
    
    expect(validatePage(undefined, 3)).toBe(1)
    expect(validatePage('2', 3)).toBe(2)
    expect(validatePage('5', 3)).toBe(3) // Max is 3
    expect(validatePage('0', 3)).toBe(1) // Min is 1
    expect(validatePage('-1', 3)).toBe(1)
    expect(validatePage('abc', 3)).toBe(1)
  })
})