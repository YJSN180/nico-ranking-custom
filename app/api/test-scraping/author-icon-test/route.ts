import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'

export async function GET() {
  try {
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: {}
    }
    
    // Test 1: 「その他」ジャンルで投稿者情報を確認
    const otherResult = await scrapeRankingPage('other', '24h')
    
    // 投稿者情報の統計
    const authorStats = {
      total: otherResult.items.length,
      withAuthorId: otherResult.items.filter(item => item.authorId).length,
      withAuthorName: otherResult.items.filter(item => item.authorName).length,
      withAuthorIcon: otherResult.items.filter(item => item.authorIcon).length,
    }
    
    results.tests.authorStats = {
      ...authorStats,
      percentageWithIcon: Math.round((authorStats.withAuthorIcon / authorStats.total) * 100) + '%',
      percentageWithName: Math.round((authorStats.withAuthorName / authorStats.total) * 100) + '%'
    }
    
    // 投稿者情報を持つ動画の詳細（上位10件）
    results.tests.videosWithAuthorInfo = otherResult.items
      .filter(item => item.authorIcon)
      .slice(0, 10)
      .map(item => ({
        rank: item.rank,
        id: item.id,
        title: item.title?.substring(0, 50) + '...',
        author: {
          id: item.authorId,
          name: item.authorName,
          icon: item.authorIcon,
          hasIcon: !!item.authorIcon,
          iconValid: item.authorIcon?.startsWith('https://'),
        }
      }))
    
    // 投稿者情報がない動画の確認
    results.tests.videosWithoutAuthorInfo = otherResult.items
      .filter(item => !item.authorIcon)
      .slice(0, 5)
      .map(item => ({
        rank: item.rank,
        id: item.id,
        title: item.title?.substring(0, 50) + '...',
        hasAuthorId: !!item.authorId,
        hasAuthorName: !!item.authorName,
        reason: !item.authorId ? 'No author ID' : 'Icon fetch failed'
      }))
    
    // センシティブ動画の投稿者情報チェック
    const sensitiveKeywords = ['Gundam', 'ガンダム', '静電気', 'ドッキリ', 'R-18', 'センシティブ']
    const sensitiveVideos = otherResult.items.filter(item => 
      sensitiveKeywords.some(keyword => item.title?.includes(keyword))
    )
    
    results.tests.sensitiveVideosAuthorInfo = {
      total: sensitiveVideos.length,
      withAuthorIcon: sensitiveVideos.filter(v => v.authorIcon).length,
      details: sensitiveVideos.slice(0, 5).map(v => ({
        rank: v.rank,
        id: v.id,
        title: v.title?.substring(0, 50) + '...',
        hasAuthorInfo: !!(v.authorName && v.authorIcon),
        authorName: v.authorName || 'N/A',
        hasIcon: !!v.authorIcon
      }))
    }
    
    // Test 2: 個別動画の投稿者情報取得テスト
    const testVideoIds = otherResult.items.slice(0, 3).map(item => item.id).filter(Boolean) as string[]
    const individualTests: any[] = []
    
    for (const videoId of testVideoIds) {
      try {
        const response = await fetch(
          `https://nvapi.nicovideo.jp/v1/video/${videoId}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
              'X-Frontend-Id': '6',
              'X-Frontend-Version': '0',
              'Referer': `https://www.nicovideo.jp/watch/${videoId}`
            }
          }
        )
        
        if (response.ok) {
          const data = await response.json()
          const owner = data.data?.owner || data.data?.channel || data.data?.community
          
          individualTests.push({
            videoId,
            success: true,
            owner: {
              id: owner?.id,
              name: owner?.name,
              iconUrl: owner?.iconUrl,
              type: data.data?.channel ? 'channel' : data.data?.community ? 'community' : 'user'
            }
          })
        } else {
          individualTests.push({
            videoId,
            success: false,
            status: response.status
          })
        }
      } catch (error) {
        individualTests.push({
          videoId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    results.tests.individualVideoTests = individualTests
    
    // サマリー
    results.summary = {
      success: authorStats.percentageWithIcon > 80,
      message: authorStats.percentageWithIcon > 80 
        ? '✅ 投稿者アイコンの取得は正常に動作しています' 
        : '⚠️ 投稿者アイコンの取得率が低い可能性があります',
      recommendations: []
    }
    
    if (authorStats.percentageWithIcon < 80) {
      results.summary.recommendations.push(
        'レート制限に達している可能性があります',
        '一部の動画は投稿者情報を持たない可能性があります'
      )
    }
    
    return NextResponse.json(results)
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}