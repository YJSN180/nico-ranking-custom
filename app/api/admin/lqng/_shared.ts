// 管理 API 共通: 認証チェックと no-store 応答（既存の /api/admin/ng-list と同じ流儀）
import { NextResponse, type NextRequest } from 'next/server'

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
