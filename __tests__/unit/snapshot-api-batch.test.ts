import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchVideoStats } from '@/lib/snapshot-api'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Snapshot API Batch Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch multiple videos in a single API call using jsonFilter', async () => {
    const videoIds = ['sm9', 'sm500873', 'sm1097445', 'sm2057168', 'sm40233256']
    
    // Mock successful response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            contentId: 'sm9',
            title: 'レッツゴー！陰陽師',
            viewCounter: 22480741,
            commentCounter: 5570636,
            mylistCounter: 182352,
            likeCounter: 37901,
            tags: '陰陽師 レッツゴー！陰陽師 公式 音楽 ゲーム'
          },
          {
            contentId: 'sm500873',
            title: '組曲『ニコニコ動画』',
            viewCounter: 15000000,
            commentCounter: 8000000,
            mylistCounter: 250000,
            likeCounter: 45000,
            tags: '音楽 ニコニコ動画 組曲'
          },
          {
            contentId: 'sm1097445',
            title: '【初音ミク】みくみくにしてあげる♪',
            viewCounter: 14000000,
            commentCounter: 3000000,
            mylistCounter: 200000,
            likeCounter: 35000,
            tags: '初音ミク VOCALOID みっくみく'
          }
        ]
      })
    })

    const result = await fetchVideoStats(videoIds)

    // Verify single API call
    expect(mockFetch).toHaveBeenCalledTimes(1)
    
    // Verify jsonFilter parameter
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('jsonFilter=')
    
    // Decode and verify jsonFilter structure
    const urlObj = new URL(url)
    const jsonFilter = JSON.parse(urlObj.searchParams.get('jsonFilter')!)
    expect(jsonFilter).toEqual({
      type: 'or',
      filters: videoIds.map(id => ({
        type: 'equal',
        field: 'contentId',
        value: id
      }))
    })

    // Verify returned data
    expect(result).toHaveProperty('sm9')
    expect(result['sm9']).toEqual({
      viewCounter: 22480741,
      commentCounter: 5570636,
      mylistCounter: 182352,
      likeCounter: 37901,
      tags: ['陰陽師', 'レッツゴー！陰陽師', '公式', '音楽', 'ゲーム']
    })
  })

  it('should handle large batches by splitting into multiple API calls', async () => {
    // Create 150 video IDs to test batch splitting
    const videoIds = Array.from({ length: 150 }, (_, i) => `sm${100000 + i}`)
    
    // Mock responses for each batch
    mockFetch.mockImplementation(async (url) => ({
      ok: true,
      json: async () => {
        // Extract jsonFilter to determine which videos to return
        const urlObj = new URL(url)
        const jsonFilter = JSON.parse(urlObj.searchParams.get('jsonFilter')!)
        const requestedIds = jsonFilter.filters.map((f: any) => f.value)
        
        return {
          data: requestedIds.slice(0, 50).map((id: string) => ({
            contentId: id,
            viewCounter: 1000,
            commentCounter: 100,
            mylistCounter: 10,
            likeCounter: 5,
            tags: 'test video'
          }))
        }
      }
    }))

    const result = await fetchVideoStats(videoIds)

    // Should make 2 API calls (100 + 50)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    
    // Verify batch sizes
    const firstCallUrl = new URL(mockFetch.mock.calls[0][0])
    const firstJsonFilter = JSON.parse(firstCallUrl.searchParams.get('jsonFilter')!)
    expect(firstJsonFilter.filters).toHaveLength(100)
    
    const secondCallUrl = new URL(mockFetch.mock.calls[1][0])
    const secondJsonFilter = JSON.parse(secondCallUrl.searchParams.get('jsonFilter')!)
    expect(secondJsonFilter.filters).toHaveLength(50)
  })

  it('should handle missing videos gracefully', async () => {
    const videoIds = ['sm1', 'sm2', 'sm3', 'sm_deleted', 'sm5']
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { contentId: 'sm1', viewCounter: 100, commentCounter: 10, mylistCounter: 5, likeCounter: 1, tags: '' },
          { contentId: 'sm2', viewCounter: 200, commentCounter: 20, mylistCounter: 10, likeCounter: 2, tags: '' },
          { contentId: 'sm3', viewCounter: 300, commentCounter: 30, mylistCounter: 15, likeCounter: 3, tags: '' },
          // sm_deleted is missing
          { contentId: 'sm5', viewCounter: 500, commentCounter: 50, mylistCounter: 25, likeCounter: 5, tags: '' }
        ]
      })
    })

    const result = await fetchVideoStats(videoIds)

    expect(Object.keys(result)).toHaveLength(4)
    expect(result).not.toHaveProperty('sm_deleted')
    expect(result).toHaveProperty('sm1')
    expect(result).toHaveProperty('sm5')
  })

  it('should handle API errors gracefully', async () => {
    const videoIds = ['sm1', 'sm2']
    
    // Mock network error
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await fetchVideoStats(videoIds)

    expect(result).toEqual({})
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should add proper headers including Googlebot User-Agent', async () => {
    const videoIds = ['sm1']
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] })
    })

    await fetchVideoStats(videoIds)

    const [url, options] = mockFetch.mock.calls[0]
    expect(options.headers).toEqual({
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'application/json',
      'Accept-Language': 'ja'
    })
  })

  it('should set correct query parameters', async () => {
    const videoIds = ['sm1']
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] })
    })

    await fetchVideoStats(videoIds)

    const [url] = mockFetch.mock.calls[0]
    const urlObj = new URL(url)
    
    expect(urlObj.searchParams.get('q')).toBe('')
    expect(urlObj.searchParams.get('targets')).toBe('title')
    expect(urlObj.searchParams.get('fields')).toBe('contentId,viewCounter,commentCounter,mylistCounter,likeCounter,tags')
    expect(urlObj.searchParams.get('_sort')).toBe('-viewCounter')
    expect(urlObj.searchParams.get('_limit')).toBe('100') // API maximum
  })
})