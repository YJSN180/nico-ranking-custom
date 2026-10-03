// 自動NG（粗悪コンテンツ）の管理画面用スナップショット: 設定・判定テーブル・イベント・追跡の要約
import { NextResponse, type NextRequest } from 'next/server'
import { kv } from '@/lib/simple-kv'
import { LQNG_KV_KEYS, isLqngControlNotFound } from '@/lib/lqng/config'
import { isLqngEnabled, readLqngConfigStrict, readLqngVerdictsStrict } from '@/lib/lqng/server'
import { isAdminAuthenticated, kvUnavailable, unauthorized, withNoStore } from '../_shared'

export const dynamic = 'force-dynamic'

interface TrackingSummary {
  lastPollAt: string | null
  lastSweepDate: string | null
  trackedAuthors: number
  pendingVideos: number
  /** 設定の対照（controlUserId）が直近の確認で見つからなかった（404）。設定を直せば消える */
  controlNotFound: boolean
}

interface EventsPayload {
  items: unknown[]
  lastRun: unknown
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdminAuthenticated(request)) return unauthorized()
  try {
    // 管理画面は常に最新を見たいのでキャッシュを通さない。設定・判定テーブルを読めなければ
    // 既定値（無効・空）を返さずに 503 にする（画面が既定値を土台に保存しないように）
    const [config, verdicts, trackingRaw, eventsRaw] = await Promise.all([
      readLqngConfigStrict(),
      readLqngVerdictsStrict(),
      kv.get<{ lastPollAt?: string | null; lastSweepDate?: string | null; authors?: Record<string, unknown>; pending?: unknown[]; lastRun?: unknown; issues?: unknown }>(LQNG_KV_KEYS.tracking).catch(() => null),
      kv.get<EventsPayload>(LQNG_KV_KEYS.events).catch(() => null),
    ])
    const tracking: TrackingSummary = {
      lastPollAt: trackingRaw?.lastPollAt ?? null,
      lastSweepDate: trackingRaw?.lastSweepDate ?? null,
      trackedAuthors: trackingRaw?.authors ? Object.keys(trackingRaw.authors).length : 0,
      pendingVideos: Array.isArray(trackingRaw?.pending) ? trackingRaw.pending.length : 0,
      controlNotFound: isLqngControlNotFound(config.controlUserId, trackingRaw?.issues),
    }
    return withNoStore(
      NextResponse.json({
        envEnabled: isLqngEnabled(),
        config,
        verdicts,
        // 直近の実行は Worker が毎回更新する追跡表のものを使う。履歴側は出来事のあった回しか更新されない旧来の置き場所
        events: { items: Array.isArray(eventsRaw?.items) ? eventsRaw.items : [], lastRun: trackingRaw?.lastRun ?? eventsRaw?.lastRun ?? null },
        tracking,
      })
    )
  } catch (error) {
    console.error('Failed to load lqng overview:', error)
    return kvUnavailable()
  }
}
