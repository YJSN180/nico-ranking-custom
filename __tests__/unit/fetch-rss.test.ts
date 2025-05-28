import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchNicoRanking } from '@/lib/fetch-rss'

describe('Fetch RSS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch RSS with correct URL and headers', async () => {
    const mockResponse = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>第1位：テスト</title>
      <link>https://www.nicovideo.jp/watch/sm123</link>
      <description><![CDATA[
        <p class="nico-info"><small><strong class="nico-info-total-view">1,000</strong></small></p>
      ]]></description>
    </item>
  </channel>
</rss>`

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => mockResponse,
    } as Response)

    const result = await fetchNicoRanking()

    expect(fetch).toHaveBeenCalledWith(
      'https://www.nicovideo.jp/ranking/genre/all?term=24h&rss=2.0&lang=ja-jp',
      {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      }
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      rank: 1,
      id: 'sm123',
      title: 'テスト',
      views: 1000,
    })
  })

  it('should throw error when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    await expect(fetchNicoRanking()).rejects.toThrow('Failed to fetch RSS: 500')
  })

  it('should throw error on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

    await expect(fetchNicoRanking()).rejects.toThrow('Network error')
  })
})