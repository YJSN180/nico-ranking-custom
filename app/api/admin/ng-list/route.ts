import { NextRequest, NextResponse } from 'next/server'
import { getAdminNGList, setNGListManual } from '@/lib/ng-list-server'
import { captureWebException } from '@/lib/sentry/capture'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store'
}

const withNoStore = (response: NextResponse) => {
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  try {
    // 管理画面の編集の土台なので、キャッシュ（サイト側の 60 秒キャッシュ・直前の成功値）を通さずに読む。
    // 自動NG は合流させない（手動の 4 項目と派生NGだけ）
    const ngList = await getAdminNGList()
    
    return withNoStore(NextResponse.json(ngList))
  } catch (error) {
    console.error('Failed to fetch NG list:', error)
    captureWebException(error, {
      tags: {
        runtime: 'next-node',
        surface: 'admin-ng-list',
        endpoint_family: '/api/admin/ng-list',
        action: 'get',
      },
    })
    // 空の一覧を返さず 503（画面は一覧を編集できない状態にする）
    return withNoStore(NextResponse.json({ error: 'Failed to fetch NG list' }, { status: 503 }))
  }
}

export async function POST(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  try {
    const ngList = await request.json()
    
    // Validate the structure
    if (!ngList.videoIds || !ngList.authorIds || !ngList.videoTitles || !ngList.authorNames) {
      return withNoStore(NextResponse.json({ error: 'Invalid NG list format' }, { status: 400 }))
    }

    // Save to Cloudflare KV
    await setNGListManual(ngList)
    
    return withNoStore(NextResponse.json({ success: true }))
  } catch (error) {
    captureWebException(error, {
      tags: {
        runtime: 'next-node',
        surface: 'admin-ng-list',
        endpoint_family: '/api/admin/ng-list',
        action: 'post',
      },
      contexts: {
        ng_list: {
          note: 'update-failed',
        },
      },
    })
    return withNoStore(NextResponse.json({ error: 'Failed to update NG list' }, { status: 500 }))
  }
}
