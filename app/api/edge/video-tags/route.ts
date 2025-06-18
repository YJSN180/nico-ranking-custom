import { NextRequest, NextResponse } from 'next/server'

// Edge Runtime指定
export const runtime = 'edge'

// 動画のタグ情報を取得するAPI (Edge Function版)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoIds = searchParams.get('ids')?.split(',').filter(Boolean) || []
    
    if (videoIds.length === 0) {
      return NextResponse.json({ error: 'No video IDs provided' }, { status: 400 })
    }
    
    // 最大100件まで許可（大量リクエスト防止）
    if (videoIds.length > 100) {
      return NextResponse.json({ error: 'Too many video IDs (max 100)' }, { status: 400 })
    }
    
    // タグ取得ライブラリをインポート
    const { fetchVideoTags } = await import('@/lib/tag-api')
    
    // タグ情報を取得
    const tags = await fetchVideoTags(videoIds)
    
    // レスポンスにタイムスタンプを追加
    const response = {
      tags,
      timestamp: new Date().toISOString(),
      count: Object.keys(tags).length
    }
    
    return NextResponse.json(response, {
      headers: {
        // タグは1時間キャッシュ（毎時0分更新想定）
        'Cache-Control': 'public, s-maxage=3600, max-age=3600',
      },
    })
  } catch (error) {
    // エラー時は空のタグオブジェクトを返す（クライアントのエラーハンドリングのため）
    return NextResponse.json(
      { 
        tags: {},
        timestamp: new Date().toISOString(),
        count: 0,
        error: 'Failed to fetch video tags'
      },
      { 
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, max-age=300',
        }
      }
    )
  }
}