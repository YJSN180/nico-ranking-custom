import { NextResponse } from 'next/server'
import { getRankingFromKV, getKVStats } from '@/lib/cloudflare-kv'

export const runtime = 'nodejs'

// KV使用量監視API
export async function GET() {
  try {
    // KV統計情報を取得
    const stats = await getKVStats()
    
    if (!stats.hasData) {
      return NextResponse.json({
        success: false,
        message: 'No data in KV',
        stats
      })
    }

    // 実際のデータを取得
    const data = await getRankingFromKV()
    
    if (!data) {
      return NextResponse.json({
        success: false,
        message: 'Failed to fetch data from KV',
        stats
      })
    }

    // データサイズを計算
    const jsonString = JSON.stringify(data)
    const uncompressedSize = Buffer.byteLength(jsonString, 'utf8')
    const estimatedCompressedSize = uncompressedSize * 0.25 // 推定圧縮率

    // ジャンル別統計
    let totalBasicItems = 0
    let totalTagItems = 0
    let genreStats: any = {}

    Object.entries(data.genres || {}).forEach(([genre, genreData]) => {
      let genreBasicItems = 0
      let genreTagItems = 0
      let genreTags = 0

      Object.entries(genreData).forEach(([period, periodData]: [string, any]) => {
        const items = periodData.items?.length || 0
        const popularTags = periodData.popularTags?.length || 0
        const tagRankings = Object.keys(periodData.tags || {}).length
        
        genreBasicItems += items
        genreTags = Math.max(genreTags, popularTags) // 最大値を記録
        
        Object.values(periodData.tags || {}).forEach((tagItems: any) => {
          genreTagItems += tagItems?.length || 0
        })
      })

      totalBasicItems += genreBasicItems
      totalTagItems += genreTagItems

      genreStats[genre] = {
        basicItems: genreBasicItems,
        tagItems: genreTagItems,
        popularTags: genreTags,
        periods: Object.keys(genreData).length
      }
    })

    // 使用率計算
    const totalItems = totalBasicItems + totalTagItems
    const storageUsagePercent = (estimatedCompressedSize / (1000 * 1024 * 1024)) * 100
    
    // 月間推定リクエスト数（仮定）
    const estimatedMonthlyReads = 2700 // 実際の値は分析結果から
    const estimatedMonthlyWrites = 4320 // 10分ごとのcron
    
    const readUsagePercent = (estimatedMonthlyReads / 3000000) * 100
    const writeUsagePercent = (estimatedMonthlyWrites / 30000) * 100

    // アラート判定
    const alerts = []
    if (storageUsagePercent > 70) alerts.push('Storage usage high')
    if (readUsagePercent > 70) alerts.push('Read requests high')
    if (writeUsagePercent > 70) alerts.push('Write requests high')

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      kvStats: stats,
      usage: {
        storage: {
          uncompressedMB: Math.round(uncompressedSize / 1024 / 1024 * 100) / 100,
          compressedMB: Math.round(estimatedCompressedSize / 1024 / 1024 * 100) / 100,
          usagePercent: Math.round(storageUsagePercent * 100) / 100,
          limit: '1,000 MB'
        },
        requests: {
          estimatedMonthlyReads,
          estimatedMonthlyWrites,
          readUsagePercent: Math.round(readUsagePercent * 100) / 100,
          writeUsagePercent: Math.round(writeUsagePercent * 100) / 100,
          readLimit: '3,000,000/month',
          writeLimit: '30,000/month'
        },
        items: {
          totalItems,
          basicItems: totalBasicItems,
          tagItems: totalTagItems,
          genres: Object.keys(data.genres || {}).length
        }
      },
      genreStats,
      alerts,
      recommendations: generateRecommendations(storageUsagePercent, readUsagePercent, writeUsagePercent)
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// 推奨事項を生成
function generateRecommendations(storage: number, reads: number, writes: number): string[] {
  const recommendations = []

  if (storage > 50) {
    recommendations.push('Consider reducing tag ranking items from 500 to 300')
    recommendations.push('Remove optional fields (authorIcon, etc.) to reduce item size')
  }

  if (storage > 70) {
    recommendations.push('Implement selective tag caching (top 10 tags only)')
    recommendations.push('Consider upgrading to paid plan')
  }

  if (reads > 50) {
    recommendations.push('Implement CDN caching')
    recommendations.push('Increase browser cache duration')
  }

  if (writes > 50) {
    recommendations.push('Consider reducing cron frequency')
    recommendations.push('Implement differential updates')
  }

  if (storage < 10 && reads < 10 && writes < 30) {
    recommendations.push('Current usage is very healthy - no action needed')
  }

  return recommendations
}