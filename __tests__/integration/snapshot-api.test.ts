import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchVideoDetails, mergeRankingData } from '@/lib/snapshot-api'
import { fetchEnhancedRanking } from '@/lib/fetch-enhanced-rss'

// Mock fetch
global.fetch = vi.fn()

describe('Snapshot API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch video details from Snapshot API', async () => {
    const mockResponse = {
      data: [
        {
          contentId: 'sm45026928',
          title: 'Test Video',
          viewCounter: 15672,
          mylistCounter: 100,
          commentCounter: 1752,
          likeCounter: 2436,
          startTime: '2025-05-27T09:00:00+00:00',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          lengthSeconds: 840,
          userId: '12345',
          tags: 'game voiceroid'
        }
      ],
      meta: {
        totalCount: 1,
        status: 200
      }
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const details = await fetchVideoDetails(['sm45026928'])
    
    expect(details.size).toBe(1)
    expect(details.get('sm45026928')).toMatchObject({
      comments: 1752,
      mylists: 100,
      likes: 2436,
      duration: '14:00',
      tags: ['game', 'voiceroid']
    })
  })

  it('should merge RSS and Snapshot data correctly', () => {
    const rssData = [
      {
        rank: 1,
        id: 'sm45026928',
        title: 'RSS Title',
        thumbURL: 'https://rss-thumb.jpg',
        views: 10000
      }
    ]

    const detailsMap = new Map([
      ['sm45026928', {
        comments: 1752,
        mylists: 100,
        likes: 2436,
        uploadDate: '2025-05-27T09:00:00+00:00',
        duration: '14:00',
        uploader: {
          name: 'TestUser',
          icon: '/api/placeholder-icon?id=12345'
        }
      }]
    ])

    const merged = mergeRankingData(rssData, detailsMap)
    
    expect(merged[0]).toMatchObject({
      rank: 1,
      id: 'sm45026928',
      title: 'RSS Title',
      thumbURL: 'https://rss-thumb.jpg',
      views: 10000,
      comments: 1752,
      mylists: 100,
      likes: 2436,
      duration: '14:00'
    })
  })

  it('should handle Snapshot API errors gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

    const details = await fetchVideoDetails(['sm45026928'])
    
    expect(details.size).toBe(0)
  })

  it('should fetch enhanced ranking with real API integration', async () => {
    // Mock RSS response
    const mockRSSResponse = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>第1位：Test Video</title>
      <link>https://www.nicovideo.jp/watch/sm45026928</link>
      <description><![CDATA[
        <p class="nico-thumbnail"><img src="https://example.com/thumb.jpg"></p>
        <p class="nico-info"><small><strong class="nico-info-total-view">15,672</strong></small></p>
      ]]></description>
    </item>
  </channel>
</rss>`

    // Mock Snapshot API response
    const mockSnapshotResponse = {
      data: [{
        contentId: 'sm45026928',
        commentCounter: 1752,
        mylistCounter: 100,
        likeCounter: 2436,
        startTime: '2025-05-27T09:00:00+00:00',
        lengthSeconds: 840,
        userId: '12345'
      }],
      meta: { totalCount: 1, status: 200 }
    }

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => mockRSSResponse,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSnapshotResponse,
      } as Response)

    const enhancedData = await fetchEnhancedRanking()
    
    expect(enhancedData[0]).toMatchObject({
      rank: 1,
      id: 'sm45026928',
      title: 'Test Video',
      views: 15672,
      comments: 1752,
      mylists: 100,
      likes: 2436
    })
  })
})