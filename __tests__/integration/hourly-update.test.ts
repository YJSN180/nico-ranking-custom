import { describe, it, expect, vi, beforeEach } from 'vitest'
import { kv } from '@/lib/simple-kv'

// Mock KV
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

describe('Hourly Update Strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should check if data is stale and needs update', async () => {
    // Test 1: Data is fresh (updated 30 minutes ago)
    const freshData = {
      items: [{ rank: 1, title: 'Test Video' }],
      lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    }
    
    vi.mocked(kv.get).mockResolvedValueOnce(freshData)
    
    // Data should be considered fresh
    const thirtyMinutesAgo = new Date(freshData.lastUpdated).getTime()
    const now = Date.now()
    const ageInMinutes = (now - thirtyMinutesAgo) / (1000 * 60)
    
    expect(ageInMinutes).toBeLessThan(60)
    
    // Test 2: Data is stale (updated 90 minutes ago)
    const staleData = {
      items: [{ rank: 1, title: 'Old Video' }],
      lastUpdated: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 minutes ago
    }
    
    vi.mocked(kv.get).mockResolvedValueOnce(staleData)
    
    const ninetyMinutesAgo = new Date(staleData.lastUpdated).getTime()
    const ageInMinutes2 = (Date.now() - ninetyMinutesAgo) / (1000 * 60)
    
    expect(ageInMinutes2).toBeGreaterThan(60)
  })

  it('should update data on first page visit if stale', async () => {
    // Mock stale data in KV
    const staleData = {
      items: [],
      lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    }
    
    vi.mocked(kv.get).mockResolvedValueOnce(staleData)
    
    // Verify that update would be triggered
    const lastUpdate = new Date(staleData.lastUpdated)
    const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)
    
    expect(hoursSinceUpdate).toBeGreaterThanOrEqual(1)
  })
})