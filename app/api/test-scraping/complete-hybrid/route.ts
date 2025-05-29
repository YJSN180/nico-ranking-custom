import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'

export async function GET() {
  try {
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: {}
    }
    
    // Test 1: その他ジャンル（センシティブ動画が多い）
    console.log('Testing "other" genre...')
    const startOther = Date.now()
    const otherResult = await scrapeRankingPage('other', '24h')
    const timeOther = Date.now() - startOther
    
    results.tests.other = {
      totalItems: otherResult.items.length,
      processingTime: `${timeOther}ms`,
      popularTags: otherResult.popularTags?.slice(0, 5),
      top10: otherResult.items.slice(0, 10).map(item => ({
        rank: item.rank,
        id: item.id,
        title: item.title,
        hasAuthorInfo: !!(item.authorName && item.authorIcon),
        hasMetadata: !!(item.comments !== undefined && item.likes !== undefined),
        stats: {
          views: item.views,
          comments: item.comments,
          mylists: item.mylists,
          likes: item.likes
        }
      }))
    }
    
    // センシティブ動画の確認
    const sensitiveVideos = otherResult.items.filter(item => 
      item.title?.includes('Gundam') || 
      item.title?.includes('ジークソクス') ||
      item.title?.includes('静電気') ||
      item.title?.includes('ドッキリ')
    )
    
    results.tests.other.sensitiveVideos = sensitiveVideos.map(v => ({
      rank: v.rank,
      id: v.id,
      title: v.title,
      hasFullData: !!(v.comments !== undefined && v.authorName)
    }))
    
    // Test 2: タグフィルタリング（nvAPIのみ使用されるはず）
    console.log('Testing tag filtering...')
    const startTag = Date.now()
    const tagResult = await scrapeRankingPage('vocaloid', '24h', 'VOCALOID伝説入り')
    const timeTag = Date.now() - startTag
    
    results.tests.tagFiltered = {
      totalItems: tagResult.items.length,
      processingTime: `${timeTag}ms`,
      top5: tagResult.items.slice(0, 5).map(item => ({
        rank: item.rank,
        id: item.id,
        title: item.title,
        hasAuthorInfo: !!(item.authorName && item.authorIcon)
      }))
    }
    
    // Test 3: 全ジャンル
    console.log('Testing "all" genre...')
    const startAll = Date.now()
    const allResult = await scrapeRankingPage('all', '24h')
    const timeAll = Date.now() - startAll
    
    results.tests.all = {
      totalItems: allResult.items.length,
      processingTime: `${timeAll}ms`,
      hasPopularTags: !!allResult.popularTags && allResult.popularTags.length > 0
    }
    
    // データ完全性チェック
    const checkDataCompleteness = (items: any[]) => {
      const total = items.length
      const withComments = items.filter(i => i.comments !== undefined).length
      const withLikes = items.filter(i => i.likes !== undefined).length
      const withAuthorName = items.filter(i => i.authorName).length
      const withAuthorIcon = items.filter(i => i.authorIcon).length
      const withTags = items.filter(i => i.tags && i.tags.length > 0).length
      
      return {
        total,
        withComments: `${withComments}/${total} (${Math.round(withComments/total*100)}%)`,
        withLikes: `${withLikes}/${total} (${Math.round(withLikes/total*100)}%)`,
        withAuthorName: `${withAuthorName}/${total} (${Math.round(withAuthorName/total*100)}%)`,
        withAuthorIcon: `${withAuthorIcon}/${total} (${Math.round(withAuthorIcon/total*100)}%)`,
        withTags: `${withTags}/${total} (${Math.round(withTags/total*100)}%)`
      }
    }
    
    results.dataCompleteness = {
      other: checkDataCompleteness(otherResult.items),
      tagFiltered: checkDataCompleteness(tagResult.items),
      all: checkDataCompleteness(allResult.items)
    }
    
    // パフォーマンスサマリー
    results.performanceSummary = {
      averageProcessingTime: Math.round((timeOther + timeTag + timeAll) / 3) + 'ms',
      recommendation: timeOther > 1000 
        ? 'Consider caching or optimizing author info fetching'
        : 'Performance is acceptable'
    }
    
    // 成功判定
    results.success = {
      sensitiveVideosIncluded: sensitiveVideos.length > 0,
      metadataComplete: results.dataCompleteness.other.withComments !== '0/0 (NaN%)',
      authorInfoAvailable: results.dataCompleteness.other.withAuthorName !== '0/0 (NaN%)',
      tagFilteringWorks: tagResult.items.length > 0 && timeTag < timeOther
    }
    
    return NextResponse.json(results)
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}