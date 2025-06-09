import { NextRequest, NextResponse } from 'next/server'
import { getFromCloudflareKV } from '../../../lib/cloudflare-kv-pages'
import { ungzip } from 'pako'
import { filterRankingData } from '../../../lib/ng-filter'
import type { RankingItem } from '../../../types/ranking'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  // Cloudflare Pages環境変数を取得
  const env = {
    CF_ACC: process.env.CF_ACC || request.headers.get('CF-ACC') || '',
    CF_NS: process.env.CF_NS || request.headers.get('CF-NS') || '',
    CF_KV_TOKEN_READ: process.env.CF_KV_TOKEN_READ || request.headers.get('CF-KV-TOKEN-READ') || ''
  };
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre') || 'all'
  const period = searchParams.get('period') || '24h'
  const tag = searchParams.get('tag') || undefined
  const page = parseInt(searchParams.get('page') || '1', 10)
  
  // Validate inputs
  const validPeriods = ['24h', 'hour']
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }
  
  try {
    // Cloudflare KVからフルスナップショットを取得
    const compressed = await getFromCloudflareKV('RANKING_LATEST', env)
    
    if (!compressed) {
      return NextResponse.json(
        { error: 'No ranking data available' },
        { status: 404 }
      )
    }
    
    // 解凍
    const decompressed = ungzip(new Uint8Array(compressed))
    const decoder = new TextDecoder()
    const jsonStr = decoder.decode(decompressed)
    const snapshot = JSON.parse(jsonStr)
    
    // ジャンルとピリオドのデータを取得
    const genreData = snapshot.genres?.[genre]
    if (!genreData) {
      return NextResponse.json(
        { error: 'Genre not found' },
        { status: 404 }
      )
    }
    
    const periodData = genreData[period]
    if (!periodData) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      )
    }
    
    let items: RankingItem[] = []
    let popularTags: string[] = periodData.popularTags || []
    
    // タグ指定がある場合
    if (tag) {
      // タグ別データを取得
      const tagData = periodData.tags?.[tag]
      if (tagData && Array.isArray(tagData)) {
        items = tagData
      } else {
        // タグデータがない場合は通常のアイテムからフィルタリング
        items = (periodData.items || []).filter((item: RankingItem) =>
          item.tags?.includes(tag)
        )
      }
    } else {
      // タグ指定がない場合は通常のアイテム
      items = periodData.items || []
    }
    
    // NGフィルタリング
    const { items: filteredItems } = await filterRankingData({ items })
    
    // ページネーション処理
    const itemsPerPage = 100
    const startIdx = (page - 1) * itemsPerPage
    const endIdx = page * itemsPerPage
    const pageItems = filteredItems.slice(startIdx, endIdx)
    
    // hasMoreフラグを計算
    const hasMore = endIdx < filteredItems.length
    
    // レスポンスを構築
    const responseData: any = {
      items: pageItems,
      hasMore,
      totalItems: filteredItems.length
    }
    
    // ページ1でタグ指定がない場合は人気タグも返す
    if (page === 1 && !tag) {
      responseData.popularTags = popularTags
    }
    
    const response = NextResponse.json(responseData)
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    response.headers.set('X-Cache-Status', 'HIT')
    response.headers.set('X-Total-Items', filteredItems.length.toString())
    
    return response
  } catch (error) {
    console.error('Error in ranking-v2 API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking data' },
      { status: 500 }
    )
  }
}