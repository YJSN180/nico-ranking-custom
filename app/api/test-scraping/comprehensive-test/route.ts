import { NextResponse } from 'next/server'
import { fetchRanking } from '@/lib/complete-hybrid-scraper'

export const runtime = 'nodejs'

// テストするランキングパターン
const TEST_PATTERNS = [
  // 総合ランキング
  { genre: 'all', term: '24h', name: '総合24時間' },
  { genre: 'all', term: 'hour', name: '総合毎時' },
  
  // ジャンル別（いくつか抜粋）
  { genre: 'entertainment', term: '24h', name: 'エンタメ24時間' },
  { genre: 'entertainment', term: 'hour', name: 'エンタメ毎時' },
  { genre: 'game', term: '24h', name: 'ゲーム24時間' },
  { genre: 'game', term: 'hour', name: 'ゲーム毎時' },
  { genre: 'anime', term: '24h', name: 'アニメ24時間' },
  { genre: 'music', term: '24h', name: '音楽24時間' },
  { genre: 'vocaloid', term: '24h', name: 'VOCALOID24時間' },
  
  // R18ジャンル
  { genre: 'r18', term: '24h', name: 'R18 24時間' },
  
  // タグ付きランキング
  { genre: 'all', term: '24h', tag: 'ゲーム', name: '総合24時間(ゲームタグ)' },
  { genre: 'game', term: '24h', tag: 'マインクラフト', name: 'ゲーム24時間(マイクラタグ)' },
]

export async function GET() {
  const results: any[] = []
  const errors: any[] = []
  
  
  // 順番にテスト（レート制限対策）
  for (const pattern of TEST_PATTERNS) {
    try {
      
      const startTime = Date.now()
      const rankingData = await fetchRanking(
        pattern.genre,
        pattern.tag || null,
        pattern.term as '24h' | 'hour'
      )
      const result = {
        items: rankingData.items,
        popularTags: rankingData.popularTags
      }
      const endTime = Date.now()
      
      const summary = {
        pattern: pattern.name,
        genre: pattern.genre,
        term: pattern.term,
        tag: pattern.tag,
        itemCount: result.items.length,
        hasSensitiveContent: result.items.some(item => 
          item.title?.includes('静電気') || 
          item.title?.includes('Gundam') ||
          item.title?.includes('センシティブ')
        ),
        popularTagsCount: result.popularTags?.length || 0,
        responseTime: `${endTime - startTime}ms`,
        topItems: result.items.slice(0, 3).map((item: any) => ({
          rank: item.rank,
          title: item.title,
          views: item.views,
          id: item.id
        }))
      }
      
      results.push(summary)
      
      // レート制限対策で少し待機
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      const errorInfo = {
        pattern: pattern.name,
        genre: pattern.genre,
        term: pattern.term,
        tag: pattern.tag,
        error: error instanceof Error ? error.message : String(error)
      }
      
      errors.push(errorInfo)
    }
  }
  
  
  return NextResponse.json({
    summary: {
      totalTests: TEST_PATTERNS.length,
      successful: results.length,
      failed: errors.length,
      successRate: `${Math.round((results.length / TEST_PATTERNS.length) * 100)}%`
    },
    results,
    errors,
    timestamp: new Date().toISOString()
  })
}