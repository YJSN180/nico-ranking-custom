// 許可リストの追加・削除（設定全体を送らずに 1 件ずつ操作できるようにする）
// 追加は判定テーブルの再登録を防ぎ、サーバー側の NG 合流から即座に外す（キャッシュ無効化）
// 土台の設定はキャッシュを通さずに読み、読めなければ 503 で書き込まない（既定値に 1 件足して保存しない）
import { NextResponse, type NextRequest } from 'next/server'
import { saveLqngConfig } from '@/lib/lqng/server'
import { invalidateServerNGListCache } from '@/lib/ng-list-server'
import { isAdminAuthenticated, readConfigForWrite, unauthorized, withNoStore } from '../_shared'

export const dynamic = 'force-dynamic'

interface AllowlistRequest {
  action: 'add' | 'remove'
  kind: 'author' | 'video'
  id: string
  note?: string
}

const ID_PATTERN = /^(\d{1,12}|channel\/ch\d{1,12}|(sm|so|nm)\d{1,12})$/

function parseBody(body: unknown): AllowlistRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const action = b.action === 'add' || b.action === 'remove' ? b.action : null
  const kind = b.kind === 'author' || b.kind === 'video' ? b.kind : null
  const id = typeof b.id === 'string' ? b.id.trim() : ''
  if (!action || !kind || !ID_PATTERN.test(id)) return null
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 200) : undefined
  return { action, kind, id, ...(note ? { note } : {}) }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAdminAuthenticated(request)) return unauthorized()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withNoStore(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }))
  }
  const req = parseBody(body)
  if (!req) return withNoStore(NextResponse.json({ error: 'Invalid allowlist request' }, { status: 400 }))
  const current = await readConfigForWrite()
  if (current.response) return current.response
  const config = current.config
  try {
    const key = req.kind === 'author' ? 'authorIds' : 'videoIds'
    const ids = new Set(config.allowlist[key])
    if (req.action === 'add') ids.add(req.id)
    else ids.delete(req.id)
    const notes = { ...(config.allowlist.notes ?? {}) }
    if (req.action === 'add' && req.note) notes[req.id] = req.note
    if (req.action === 'remove') delete notes[req.id]
    const saved = await saveLqngConfig({ ...config, allowlist: { ...config.allowlist, [key]: Array.from(ids), notes } })
    invalidateServerNGListCache()
    // 画面は応答の設定全体で状態を置き換える（許可リストだけを差し込まない）
    return withNoStore(NextResponse.json({ success: true, config: saved }))
  } catch (error) {
    console.error('Failed to update lqng allowlist:', error)
    return withNoStore(NextResponse.json({ error: 'Failed to update allowlist' }, { status: 500 }))
  }
}
