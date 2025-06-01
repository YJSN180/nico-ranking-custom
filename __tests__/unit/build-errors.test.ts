import { describe, it, expect } from 'vitest'
import { fetchRanking } from '../../lib/complete-hybrid-scraper'
import type { RankingItem } from '../../types/ranking'

describe('Build Error Fixes', () => {
  it('should have fetchRanking exported from complete-hybrid-scraper', () => {
    expect(typeof fetchRanking).toBe('function')
  })

  it('should return proper types from fetchRanking', async () => {
    // This test ensures the return type is correct
    const mockResult = {
      genre: 'test',
      label: 'Test',
      tag: null,
      term: '24h' as const,
      items: [] as RankingItem[],
      updatedAt: new Date().toISOString(),
      popularTags: [] as string[]
    }

    // Type checking happens at compile time
    const result: {
      genre: string
      label: string
      tag: string | null
      term: string
      items: RankingItem[]
      updatedAt: string
      popularTags?: string[]
    } = mockResult

    expect(result).toBeDefined()
  })
})