import { NextResponse } from 'next/server'
import { kv } from '@/lib/simple-kv'
import { fetchNicoRanking } from '@/lib/fetch-rss'
// import { mockRankingData } from '@/lib/mock-data' // モックデータは使用しない

// 管理者用：手動でランキングデータを更新
export async function POST(request: Request) {
  try {
    // 環境変数からの認証
    const { searchParams } = new URL(request.url)
    const adminKey = searchParams.get('key')
    
    // ADMIN_KEYが設定されていない場合はエラー
    if (!process.env.ADMIN_KEY) {
      // ADMIN_KEY environment variable is not set
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    if (adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let items: any[] = []
    let isRealData = true
    let fetchError = null
    
    // 実際のRSS取得を試みる
    try {
      items = await fetchNicoRanking()
    } catch (error) {
      // エラー時は空のデータを設定（モックデータは使用しない）
      fetchError = error instanceof Error ? error.message : 'Unknown error'
      items = []
      isRealData = false
    }
    
    // KVに保存
    await kv.set('ranking-data', items, {
      ex: 3600, // 1時間のTTL
    })
    
    // 更新履歴も保存
    const updateHistory = {
      updatedAt: new Date().toISOString(),
      isRealData,
      itemCount: items.length,
      fetchError,
    }
    await kv.set('last-update', updateHistory, {
      ex: 86400, // 24時間保持
    })

    return NextResponse.json({
      success: true,
      message: 'Ranking data updated successfully',
      isRealData,
      itemCount: items.length,
      updatedAt: updateHistory.updatedAt,
      fetchError,
      sampleItems: items.slice(0, 3).map((item: any) => ({
        rank: item.rank,
        title: item.title,
        id: item.id,
      })),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// 更新状態を確認
export async function GET(request: Request) {
  try {
    const lastUpdate = await kv.get<any>('last-update')
    const data = await kv.get<any>('ranking-data')
    
    return NextResponse.json({
      lastUpdate: lastUpdate || { message: 'No update history found' },
      currentDataCount: Array.isArray(data) ? data.length : 0,
      kvKeys: {
        'ranking-data': !!data,
        'last-update': !!lastUpdate,
      },
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}