import { NextRequest, NextResponse } from 'next/server'
import { getPopularTags } from '@/lib/popular-tags'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { getCacheHeaders } from '@/lib/cache-durations'
import { handleConditionalRequest, generateETag, paginate, getOptimizedHeaders } from '@/lib/api-optimization'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const genre = searchParams.get('genre') as RankingGenre || 'all'
  const period = searchParams.get('period') as RankingPeriod || '24h'
  
  try {
    // 環境変数の確認（デバッグ用）
    const host = request.headers.get('host') || ''
    const isPreview = host.includes('.vercel.app')

    if (isPreview) {
      const hasKVCredentials = Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID &&
        process.env.KV_RANKING_ID &&
        process.env.CLOUDFLARE_API_TOKEN
      )

      if (!hasKVCredentials) {
        console.warn('[API/popular-tags] Missing Cloudflare KV credentials in preview environment')
        console.warn('[API/popular-tags] Required: CLOUDFLARE_ACCOUNT_ID, KV_RANKING_ID, CLOUDFLARE_API_TOKEN')
      }
    }

    const tags = await getPopularTags(genre, period)

    // Fast Origin Transfer最適化: ETag生成
    const dataStr = JSON.stringify({ tags, genre, period })
    const etag = generateETag(dataStr)

    // 条件付きリクエストの処理 (304応答でデータ転送を削減)
    const conditionalResponse = handleConditionalRequest(request, { tags }, etag)
    if (conditionalResponse) {
      return conditionalResponse
    }

    // ページネーション対応
    const limit = searchParams.get('limit')
    const offset = searchParams.get('offset')

    let responseData = { tags, genre, period }

    if (limit || offset) {
      const paginatedResult = paginate(tags, {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      })
      responseData = {
        ...responseData,
        tags: paginatedResult.items,
        total: paginatedResult.total,
        hasMore: paginatedResult.hasMore
      }
    }

    return NextResponse.json(responseData, {
      headers: getOptimizedHeaders(etag, 1800, 3600)
    })
  } catch (error) {
    console.error('[API/popular-tags] Error:', error)
    console.error('[API/popular-tags] Genre:', genre, 'Period:', period)
    
    return NextResponse.json({ tags: [] }, {
      status: 200, // エラーでも200を返して空配列を返す
      headers: {
        'Cache-Control': getCacheHeaders('popular-tags')
      }
    })
  }
}