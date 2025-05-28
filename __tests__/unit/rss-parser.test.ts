import { describe, it, expect } from 'vitest'
import { parseRSSToRankingItems } from '@/lib/rss-parser'
import type { RankingItem } from '@/types/ranking'

describe('RSS Parser', () => {
  it('should parse RSS XML and extract ranking items', () => {
    const mockRSSXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>動画ランキング(24時間) - ニコニコ動画</title>
    <item>
      <title>第1位：テスト動画タイトル１</title>
      <link>https://www.nicovideo.jp/watch/sm123456?ref=rss_specified_ranking_rss2</link>
      <description><![CDATA[
        <p class="nico-thumbnail"><img alt="テスト動画" src="https://nicovideo.cdn.nimg.jp/thumbnails/123456/123456.1234567" width="94" height="70" border="0"/></p>
        <p class="nico-description">動画の説明</p>
        <p class="nico-info"><small><strong class="nico-info-length">10:00</strong>｜<strong class="nico-info-date">2025年05月27日 12：00：00</strong> 投稿<br/><strong>合計</strong>&nbsp;&#x20;再生：<strong class="nico-info-total-view">100,000</strong>&nbsp;&#x20;コメント：<strong class="nico-info-total-res">1,000</strong>&nbsp;&#x20;いいね！：<strong class="nico-info-total-like">500</strong>&nbsp;&#x20;マイリスト：<strong class="nico-info-total-mylist">50</strong></small></p>
      ]]></description>
    </item>
    <item>
      <title>第2位：テスト動画タイトル２</title>
      <link>https://www.nicovideo.jp/watch/sm789012?ref=rss_specified_ranking_rss2</link>
      <description><![CDATA[
        <p class="nico-thumbnail"><img alt="テスト動画2" src="https://nicovideo.cdn.nimg.jp/thumbnails/789012/789012.7890123" width="94" height="70" border="0"/></p>
        <p class="nico-description">動画の説明2</p>
        <p class="nico-info"><small><strong class="nico-info-length">5:00</strong>｜<strong class="nico-info-date">2025年05月27日 11：00：00</strong> 投稿<br/><strong>合計</strong>&nbsp;&#x20;再生：<strong class="nico-info-total-view">50,000</strong>&nbsp;&#x20;コメント：<strong class="nico-info-total-res">500</strong>&nbsp;&#x20;いいね！：<strong class="nico-info-total-like">250</strong>&nbsp;&#x20;マイリスト：<strong class="nico-info-total-mylist">25</strong></small></p>
      ]]></description>
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
<rss version="2.0">
  <channel>
    <item>
      <title>第1位：動画タイトル</title>
      <link>https://www.nicovideo.jp/watch/sm111111</link>
      <description><![CDATA[
        <p class="nico-description">動画の説明</p>
        <p class="nico-info"><small><strong class="nico-info-total-view">1,000</strong></small></p>
      ]]></description>
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
        <title>第${i + 1}位：動画${i + 1}</title>
        <link>https://www.nicovideo.jp/watch/sm${i}</link>
        <description><![CDATA[
          <p class="nico-thumbnail"><img src="https://example.com/thumb${i}.jpg"></p>
          <p class="nico-info"><small><strong class="nico-info-total-view">${(10000 - i * 10).toLocaleString()}</strong></small></p>
        ]]></description>
      </item>
    `).join('')
    
    const mockRSSXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>${items}</channel>
</rss>`

    const result = parseRSSToRankingItems(mockRSSXML)
    expect(result).toHaveLength(100)
    expect(result[99]?.rank).toBe(100)
  })
})