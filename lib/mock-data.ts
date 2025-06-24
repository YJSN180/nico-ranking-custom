import type { RankingItem, PopularTag } from '@/types/ranking'

// 開発環境用のモックデータ生成
export function generateMockRankingData(count: number = 100): RankingItem[] {
  const mockTitles = [
    'VOCALOID新曲リンク',
    'ゲーム実況プレイ',
    '歌ってみた',
    '踊ってみた',
    'MMD艦これ',
    'ゆっくり実況プレイ',
    'アニメOP集',
    '音MAD',
    'VOICEROIDキッチン',
    '作業用BGM'
  ]

  const mockTags = [
    'VOCALOID',
    'ゲーム',
    '実況プレイ',
    '歌ってみた',
    '踊ってみた',
    'MMD',
    'アニメ',
    '音楽',
    'VOICEROID',
    'ゆっくり実況'
  ]

  const items: RankingItem[] = []
  
  for (let i = 0; i < count; i++) {
    const randomTitle = mockTitles[Math.floor(Math.random() * mockTitles.length)]
    const randomTagCount = Math.floor(Math.random() * 5) + 1
    const selectedTags = [...mockTags]
      .sort(() => Math.random() - 0.5)
      .slice(0, randomTagCount)

    items.push({
      rank: i + 1,
      id: `sm${40000000 + i}`,
      title: `【${randomTitle}】テスト動画 Part ${i + 1}`,
      thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${40000000 + i}/${40000000 + i}`,
      views: Math.floor(Math.random() * 100000) + 1000,
      likes: Math.floor(Math.random() * 5000) + 100,
      mylists: Math.floor(Math.random() * 1000) + 10,
      comments: Math.floor(Math.random() * 2000) + 50,
      duration: Math.floor(Math.random() * 600) + 60,
      registeredAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      tags: selectedTags,
      originalRank: Math.random() > 0.5 ? i + Math.floor(Math.random() * 10) - 5 : 0
    })
  }

  return items
}

export function generateMockPopularTags(): PopularTag[] {
  const baseTags = [
    'VOCALOID',
    'ゲーム',
    '実況プレイ',
    '歌ってみた',
    '踊ってみた',
    'MMD',
    'アニメ',
    '音楽',
    'VOICEROID',
    'ゆっくり実況',
    '初音ミク',
    '東方',
    'RTA',
    'MAD',
    'エンターテイメント'
  ]

  return baseTags.map((tag, index) => ({
    name: tag,
    count: Math.floor(Math.random() * 5000) + 1000,
    rank: index + 1
  }))
}

// 開発環境チェック関数
export function isDevelopmentWithoutKV(): boolean {
  return process.env.NODE_ENV === 'development' && 
         (!process.env.KV_RANKING_ID || !process.env.CLOUDFLARE_API_TOKEN)
}

// 旧APIとの互換性のため
export function getMockRankingData(): RankingItem[] {
  return generateMockRankingData(100)
}

export const mockRankingData = getMockRankingData()