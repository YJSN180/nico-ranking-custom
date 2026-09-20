// 自動NG（粗悪コンテンツ）の管理画面用スナップショット: 設定・判定テーブル・イベント・追跡の要約
import { NextResponse, type NextRequest } from 'next/server'
import { kv } from '@/lib/simple-kv'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import { getLqngConfig, getLqngVerdicts, invalidateLqngCache, isLqngEnabled } from '@/lib/lqng/server'
import { isAdminAuthenticated, unauthorized, withNoStore } from '../_shared'

export const dynamic = 'force-dynamic'

interface TrackingSummary {
  lastPollAt: string | null
  lastSweepDate: string | null
  trackedAuthors: number
  pendingVideos: number
}

interface EventsPayload {
  items: unknown[]
  lastRun: unknown
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdminAuthenticated(request)) return unauthorized()
  try {
    // 管理画面は常に最新を見たいので、サーバー側の 60 秒キャッシュを飛ばす
    invalidateLqngCache()
    const [config, verdicts, trackingRaw, eventsRaw] = await Promise.all([
      getLqngConfig(),
      getLqngVerdicts(),
      kv.get<{ lastPollAt?: string | null; lastSweepDate?: string | null; authors?: Record<string, unknown>; pending?: unknown[] }>(LQNG_KV_KEYS.tracking).catch(() => null),
      kv.get<EventsPayload>(LQNG_KV_KEYS.events).catch(() => null),
    ])
    const tracking: TrackingSummary = {
      lastPollAt: trackingRaw?.lastPollAt ?? null,
      lastSweepDate: trackingRaw?.lastSweepDate ?? null,
      trackedAuthors: trackingRaw?.authors ? Object.keys(trackingRaw.authors).length : 0,
      pendingVideos: Array.isArray(trackingRaw?.pending) ? trackingRaw.pending.length : 0,
    }
    return withNoStore(
      NextResponse.json({
        envEnabled: isLqngEnabled(),
        config,
        verdicts,
        events: { items: Array.isArray(eventsRaw?.items) ? eventsRaw.items : [], lastRun: eventsRaw?.lastRun ?? null },
        tracking,
      })
    )
  } catch (error) {
    console.error('Failed to load lqng overview:', error)
    return withNoStore(NextResponse.json({ error: 'Failed to load overview' }, { status: 500 }))
  }
}
