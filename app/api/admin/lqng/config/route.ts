// 自動NG の設定（タグ群・照合語・閾値・ポーリング対象）の読み書き
// 許可リストはここでは変えない（/api/admin/lqng/allowlist の差分 API だけで変える）
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeLqngConfig } from '@/lib/lqng/config'
import { readLqngConfigStrict, saveLqngConfig } from '@/lib/lqng/server'
import { invalidateServerNGListCache } from '@/lib/ng-list-server'
import { isAdminAuthenticated, kvUnavailable, readConfigForWrite, unauthorized, withNoStore } from '../_shared'

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
  const input = body as Record<string, unknown>
  // 版番号は画面が読み込んだ設定の updatedAt。現在の版と違えば、他の保存（許可リストの更新を含む）を
  // 古い内容で上書きしないよう 409 にする
  const baseVersion = typeof input.updatedAt === 'string' ? input.updatedAt : null
  if (!baseVersion) {
    return withNoStore(NextResponse.json({ error: 'Missing config version (updatedAt)' }, { status: 400 }))
  }
  const current = await readConfigForWrite()
  if (current.response) return current.response
  if (current.config.updatedAt !== baseVersion) {
    return withNoStore(NextResponse.json({ error: 'Config version conflict' }, { status: 409 }))
  }
  try {
    // 許可リストは PUT に含まれていても無視し、KV の現在の値を保つ
    const saved = await saveLqngConfig({ ...normalizeLqngConfig(input), allowlist: current.config.allowlist })
    invalidateServerNGListCache()
    return withNoStore(NextResponse.json({ success: true, config: saved }))
  } catch (error) {
    console.error('Failed to save lqng config:', error)
    return withNoStore(NextResponse.json({ error: 'Failed to save config' }, { status: 500 }))
  }
}
