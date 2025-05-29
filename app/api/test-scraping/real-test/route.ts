import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'other'
  const term = (searchParams.get('term') || '24h') as '24h' | 'hour'
  
  try {
    const startTime = Date.now()
    const result = await scrapeRankingPage(genre, term)
    const elapsedTime = Date.now() - startTime
    
    // 統計情報
    const stats = {
      total: result.items.length,
      withAuthorId: result.items.filter(item => item.authorId).length,
      withAuthorName: result.items.filter(item => item.authorName).length,
      withAuthorIcon: result.items.filter(item => item.authorIcon).length,
    }
    
    const response = {
      timestamp: new Date().toISOString(),
      processingTime: `${elapsedTime}ms`,
      genre,
      term,
      stats: {
        ...stats,
        percentages: {
          withAuthorId: Math.round((stats.withAuthorId / stats.total) * 100) + '%',
          withAuthorName: Math.round((stats.withAuthorName / stats.total) * 100) + '%',
          withAuthorIcon: Math.round((stats.withAuthorIcon / stats.total) * 100) + '%',
        }
      },
      popularTags: result.popularTags?.slice(0, 10),
      // 最初の10件の詳細
      sampleVideos: result.items.slice(0, 10).map(item => ({
        rank: item.rank,
        id: item.id,
        title: item.title,
        views: item.views,
        author: {
          id: item.authorId,
          name: item.authorName,
          hasIcon: !!item.authorIcon,
          iconUrl: item.authorIcon
        },
        metadata: {
          hasComments: item.comments !== undefined,
          hasLikes: item.likes !== undefined,
          hasTags: !!(item.tags && item.tags.length > 0)
        }
      })),
      // センシティブ動画のチェック
      sensitiveCheck: (() => {
        const keywords = ['Gundam', 'ガンダム', '静電気', 'ドッキリ']
        const sensitiveVideos = result.items.filter(item => 
          keywords.some(keyword => item.title?.includes(keyword))
        )
        return {
          found: sensitiveVideos.length,
          withAuthorInfo: sensitiveVideos.filter(v => v.authorIcon).length,
          samples: sensitiveVideos.slice(0, 3).map(v => ({
            rank: v.rank,
            title: v.title,
            hasAuthorIcon: !!v.authorIcon
          }))
        }
      })(),
      success: stats.withAuthorIcon >= stats.total * 0.7
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}