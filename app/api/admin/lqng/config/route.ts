// 自動NG の設定（タグ群・照合語・閾値・ポーリング対象・許可リスト）の読み書き
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeLqngConfig } from '@/lib/lqng/config'
import { getLqngConfig, invalidateLqngCache, saveLqngConfig } from '@/lib/lqng/server'
import { invalidateServerNGListCache } from '@/lib/ng-list-server'
import { isAdminAuthenticated, unauthorized, withNoStore } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdminAuthenticated(request)) return unauthorized()
  try {
    invalidateLqngCache()
    return withNoStore(NextResponse.json(await getLqngConfig()))
  } catch (error) {
    console.error('Failed to load lqng config:', error)
    return withNoStore(NextResponse.json({ error: 'Failed to load config' }, { status: 500 }))
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
    await saveLqngConfig(config)
    invalidateServerNGListCache()
    return withNoStore(NextResponse.json({ success: true, config }))
  } catch (error) {
    console.error('Failed to save lqng config:', error)
    return withNoStore(NextResponse.json({ error: 'Failed to save config' }, { status: 500 }))
  }
}
