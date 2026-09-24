// 管理 API 共通: 認証チェックと no-store 応答（既存の /api/admin/ng-list と同じ流儀）
import { NextResponse, type NextRequest } from 'next/server'
import { readLqngConfigStrict } from '@/lib/lqng/server'
import type { LqngConfig } from '@/lib/lqng/types'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

export function withNoStore<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value)
  return response
}

export function isAdminAuthenticated(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  return Boolean(authHeader || cookie?.value)
}

export function unauthorized(): NextResponse {
  return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
}

/** KV を読めなかったときの 503（既定値や空の値を返して取り違えさせない） */
export function kvUnavailable(): NextResponse {
  return withNoStore(NextResponse.json({ error: 'KV unavailable' }, { status: 503 }))
}

/**
 * 書き込みの土台にする設定を、キャッシュを通さずに読む。
 * 読み取りに失敗したら 503 の応答を返す（既定値を土台に保存して本番の設定を消さない）。
 */
export async function readConfigForWrite(): Promise<{ config: LqngConfig; response?: undefined } | { config?: undefined; response: NextResponse }> {
  try {
    return { config: await readLqngConfigStrict() }
  } catch (error) {
    console.error('Failed to read lqng config before writing:', error)
    return { response: kvUnavailable() }
  }
}
