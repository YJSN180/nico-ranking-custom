import { describe, it, expect } from 'vitest'
import { parseRSSToRankingItems } from '@/lib/rss-parser'
import type { RankingItem } from '@/types/ranking'

describe('RSS Parser', () => {
  it('should parse RSS XML and extract ranking items', () => {
    const mockRSSXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nico="http://www.nicovideo.jp/rss/2.0">
  <channel>
    <title>ニコニコ動画 24時間 総合 ランキング</title>
    <item>
      <title>【第1位】テスト動画タイトル１</title>
      <link>https://www.nicovideo.jp/watch/sm123456</link>
      <description><![CDATA[<p class="nico-thumbnail"><img src="https://nicovideo.cdn.nimg.jp/thumbnails/123456/123456.1234567"></p>]]></description>
      <nico:views>100000</nico:views>
    </item>
    <item>
      <title>【第2位】テスト動画タイトル２</title>
      <link>https://www.nicovideo.jp/watch/sm789012</link>
      <description><![CDATA[<p class="nico-thumbnail"><img src="https://nicovideo.cdn.nimg.jp/thumbnails/789012/789012.7890123"></p>]]></description>
      <nico:views>50000</nico:views>
    </item>
  </channel>
</rss>`

    const expected: RankingItem[] = [
      {
        rank: 1,
        id: 'sm123456',
        title: 'テスト動画タイトル１',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/123456/123456.1234567',
        views: 100000,
      },
      {
        rank: 2,
        id: 'sm789012',
        title: 'テスト動画タイトル２',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/789012/789012.7890123',
        views: 50000,
      },
    ]

    const result = parseRSSToRankingItems(mockRSSXML)
    expect(result).toEqual(expected)
  })

  it('should handle missing thumbnail gracefully', () => {
    const mockRSSXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nico="http://www.nicovideo.jp/rss/2.0">
  <channel>
    <item>
      <title>【第1位】動画タイトル</title>
      <link>https://www.nicovideo.jp/watch/sm111111</link>
      <description>No thumbnail here</description>
      <nico:views>1000</nico:views>
    </item>
  </channel>
</rss>`

    const result = parseRSSToRankingItems(mockRSSXML)
    expect(result[0]).toMatchObject({
      rank: 1,
      id: 'sm111111',
      title: '動画タイトル',
      thumbURL: '',
      views: 1000,
    })
  })

  it('should limit results to top 100', () => {
    const items = Array.from({ length: 150 }, (_, i) => `
      <item>
        <title>【第${i + 1}位】動画${i + 1}</title>
        <link>https://www.nicovideo.jp/watch/sm${i}</link>
        <nico:views>${10000 - i * 10}</nico:views>
      </item>
    `).join('')
    
    const mockRSSXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nico="http://www.nicovideo.jp/rss/2.0">
  <channel>${items}</channel>
</rss>`

    const result = parseRSSToRankingItems(mockRSSXML)
    expect(result).toHaveLength(100)
    expect(result[99]?.rank).toBe(100)
  })
})