import { NextResponse } from 'next/server'
import { fetchNicoRanking } from '@/lib/fetch-rss'
import { mockRankingData } from '@/lib/mock-data'

// テスト用エンドポイント：実際のRSS取得をテスト
export async function GET() {
  try {
    const items = await fetchNicoRanking()
    
    return NextResponse.json({
      success: true,
      itemsCount: items.length,
      isRealData: true,
      sampleItems: items.slice(0, 3), // 最初の3件を表示
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    // エラーの場合はモックデータとエラー情報を返す
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      isRealData: false,
      mockDataAvailable: true,
      mockItemsCount: mockRankingData.length,
      timestamp: new Date().toISOString(),
    })
  }
}