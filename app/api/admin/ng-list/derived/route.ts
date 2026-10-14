import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@/lib/simple-kv'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Only use the secure ng-list-derived key
    // DO NOT include NG data in public ranking data for security reasons
    let derivedVideoIds: string[] = []
    let lastUpdated: string | null = null
    
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
    
    // KV を読めないときは、空の一覧を 200 で返さず 503 にする（手動NG の GET と同じ。
    // 画面は再同期の失敗として扱い、表示中の一覧をそのまま残す）
    const unavailable = (): NextResponse => NextResponse.json({ error: 'Failed to read derived NG list' }, { status: 503 })

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      return unavailable()
    }
    
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`,
        {
          headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`
          }
        }
      )
      
      if (response.ok) {
        derivedVideoIds = await response.json()
        lastUpdated = new Date().toISOString()
      } else if (response.status === 404) {
        // Key not found, return empty list
        derivedVideoIds = []
      } else {
        return unavailable()
      }
    } catch (error) {
      console.error('Failed to fetch derived NG list:', error)
      return unavailable()
    }
    
    return NextResponse.json({
      videoIds: derivedVideoIds,
      count: derivedVideoIds.length,
      lastUpdated,
      totalVideosProcessed: derivedVideoIds.length
    })
  } catch (error) {
    console.error('Error in derived NG list API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
    
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      return NextResponse.json({ error: 'KV credentials not configured' }, { status: 500 })
    }
    
    // キーは削除せず空の配列を書く。毎時パイプライン（update-ranking-parallel-v2 の getNGList、
    // sync-ranking-auxiliary）は ng-list-derived が文字列の配列として存在することを前提にし、404 で失敗する。
    // 以前の /keys/{key} への DELETE は KV REST API に無い経路で、何も消していなかった
    await kv.set('ng-list-derived', [])
    
    return NextResponse.json({
      success: true,
      message: 'Derived NG list cleared successfully'
    })
  } catch (error) {
    console.error('Error clearing derived NG list:', error)
    return NextResponse.json({ error: 'Failed to clear derived NG list' }, { status: 500 })
  }
}