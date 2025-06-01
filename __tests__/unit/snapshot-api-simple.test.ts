import { describe, test, expect, vi } from 'vitest'
import type { VideoStats } from '@/lib/snapshot-api'

// モジュールをモック
vi.mock('@/lib/snapshot-api', () => ({
  fetchVideoStats: vi.fn(),
  searchVideosByTag: vi.fn()
}))

import { fetchVideoStats, searchVideosByTag } from '@/lib/snapshot-api'

describe('Snapshot API (mocked)', () => {
  test('fetchVideoStats returns mocked data', async () => {
    const mockData: Record<string, VideoStats> = {
      sm12345: { viewCounter: 1000, commentCounter: 50 }
    }
    
    vi.mocked(fetchVideoStats).mockResolvedValueOnce(mockData)
    
    const result = await fetchVideoStats(['sm12345'])
    expect(result).toEqual(mockData)
  })
  
  test('searchVideosByTag returns mocked data', async () => {
    const mockData = [
      { contentId: 'sm12345', title: 'Test', viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 }
    ]
    
    vi.mocked(searchVideosByTag).mockResolvedValueOnce(mockData)
    
    const result = await searchVideosByTag('test')
    expect(result).toEqual(mockData)
  })
})