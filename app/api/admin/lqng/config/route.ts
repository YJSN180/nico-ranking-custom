// 自動NG の設定（タグ群・照合語・閾値・ポーリング対象・許可リスト）の読み書き
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeLqngConfig } from '@/lib/lqng/config'
import { readLqngConfigStrict, saveLqngConfig } from '@/lib/lqng/server'
import { invalidateServerNGListCache } from '@/lib/ng-list-server'
import { isAdminAuthenticated, kvUnavailable, unauthorized, withNoStore } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdminAuthenticated(request)) return unauthorized()
  try {
    // キャッシュを通さずに読む。読めなければ既定値を返さず 503
    return withNoStore(NextResponse.json(await readLqngConfigStrict()))
  } catch (error) {
    console.error('Failed to load lqng config:', error)
    return kvUnavailable()
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  if (!isAdminAuthenticated(request)) return unauthorized()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withNoStore(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }))
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return withNoStore(NextResponse.json({ error: 'Invalid config format' }, { status: 400 }))
  }
  try {
    const config = normalizeLqngConfig(body)
    const saved = await saveLqngConfig(config)
    invalidateServerNGListCache()
    return withNoStore(NextResponse.json({ success: true, config: saved }))
  } catch (error) {
    console.error('Failed to save lqng config:', error)
    return withNoStore(NextResponse.json({ error: 'Failed to save config' }, { status: 500 }))
  }
}
