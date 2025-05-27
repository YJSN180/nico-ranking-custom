import type { RankingItem } from '@/types/ranking'

export const mockRankingData: RankingItem[] = [
  {
    rank: 1,
    id: 'sm43521234',
    title: '【初音ミク】テストソング【オリジナル】',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/43521234/43521234.jpg',
    views: 150000,
  },
  {
    rank: 2,
    id: 'sm43521235',
    title: 'ゲーム実況プレイ Part1',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/43521235/43521235.jpg',
    views: 120000,
  },
  {
    rank: 3,
    id: 'sm43521236',
    title: '料理動画：簡単レシピ',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/43521236/43521236.jpg',
    views: 98000,
  },
  // ... 実際は100件まで
].concat(
  Array.from({ length: 97 }, (_, i) => ({
    rank: i + 4,
    id: `sm4352${1237 + i}`,
    title: `サンプル動画 ${i + 4}`,
    thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/4352${1237 + i}/4352${1237 + i}.jpg`,
    views: Math.floor(Math.random() * 50000) + 10000,
  }))
)