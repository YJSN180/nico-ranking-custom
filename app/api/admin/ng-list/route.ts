import { NextRequest, NextResponse } from 'next/server'
import { getAdminNGList, setNGListManual, type ManualNGList } from '@/lib/ng-list-server'
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

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

// タイトル・投稿者名は { exact, partial }。旧形式（文字列の配列）は完全一致として受け付ける
// （読み取り側の migrateLegacyNGList と同じ解釈）
function toMatchLists(value: unknown): ManualNGList['videoTitles'] | null {
  if (isStringArray(value)) return { exact: value, partial: [] }
  if (typeof value !== 'object' || value === null) return null
  const { exact, partial } = value as Record<string, unknown>
  return isStringArray(exact) && isStringArray(partial) ? { exact, partial } : null
}

/**
 * 手動 NG の 4 項目（videoIds, videoTitles, authorIds, authorNames）だけを取り出す。
 * GET が返す派生NGや、サイト側で合流する自動NG（autoAuthorIds / autoVideoIds）を手動に固定しない
 */
function parseManualNGList(body: unknown): ManualNGList | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const { videoIds, videoTitles, authorIds, authorNames } = body as Record<string, unknown>
  const titles = toMatchLists(videoTitles)
  const names = toMatchLists(authorNames)
  if (!isStringArray(videoIds) || !isStringArray(authorIds) || !titles || !names) return null
  return { videoIds, videoTitles: titles, authorIds, authorNames: names }
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
    // Validate the structure
    const ngList = parseManualNGList(await request.json())
    if (!ngList) {
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
