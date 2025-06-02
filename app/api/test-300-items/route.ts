import { NextResponse } from 'next/server'
import type { RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

export async function GET() {
  // 300件のテストデータを生成
  const items: RankingItem[] = Array.from({ length: 300 }, (_, i) => ({
    rank: i + 1,
    id: `sm${40000000 + i}`,
    title: `テスト動画 ${i + 1} - これは300件のテストデータです`,
    thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${40000000 + i}/${40000000 + i}.jpg`,
    views: Math.floor(Math.random() * 100000) + 1000,
    comments: Math.floor(Math.random() * 1000),
    mylists: Math.floor(Math.random() * 500),
    likes: Math.floor(Math.random() * 5000),
    authorId: `user${Math.floor(i / 10)}`,
    authorName: `テストユーザー${Math.floor(i / 10)}`,
    registeredAt: new Date(Date.now() - i * 3600000).toISOString()
  }))
  
  return NextResponse.json({
    items,
    popularTags: ['テスト', 'VOICEROID実況プレイ', 'ゲーム', '実況プレイ動画', 'VOCALOID'],
    message: 'これは300件のテストデータです'
  })
}