// 粗悪コンテンツ自動NG ポーリング Worker（Cloudflare cron）
// - */15 * * * *  : nvapi 新着の差分取得 → 補完 → 判定 → KV の判定テーブル更新
// - 10 20 * * *   : 05:10 JST に Snapshot「前日分」のタイトルスイープ
// 判定ロジックは lib/lqng（Next.js と共用）。設定・許可リストは KV lqng:config（管理画面で編集）。
import { Sentry, captureWorkerException, createWorkerSentryOptions } from '../../sentry.js'
import { commitBackfill, createLiveBackfillDeps, emptyDeltas, runBackfillStep, type BackfillCursor, type BackfillDeltas } from './backfill'
import { runPoll, type RunMode, type RunResult } from './poll'
import { createLiveDeps } from './sources'
import { loadState, type KvLike } from './state'

interface Env {
  LQNG_KV: KvLike
  WORKER_AUTH_KEY?: string
  SENTRY_WORKER_DSN?: string
  ENVIRONMENT?: string
}

interface ScheduledController {
  cron: string
  scheduledTime: number
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void
}

export const SWEEP_CRON = '10 20 * * *'

async function run(env: Env, mode: RunMode): Promise<RunResult> {
  try {
    const result = await runPoll(env.LQNG_KV, createLiveDeps(), mode)
    return result
  } catch (error) {
    captureWorkerException(error, {
      tags: { runtime: 'cloudflare-worker', surface: 'lqng-poller', endpoint_family: 'scheduled', worker_version: 'lqng-poller', mode },
    })
    throw error
  }
}

const handler = {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContextLike): Promise<void> {
    const mode: RunMode = controller.cron === SWEEP_CRON ? 'sweep' : 'poll'
    ctx.waitUntil(run(env, mode))
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', time: new Date().toISOString() })
    }
    // 運用確認用（認証なし）。件数と直近の実行サマリだけを返し、ID・名前・タイトルは含めない
    if (url.pathname === '/status') {
      const nowIso = new Date().toISOString()
      const state = await loadState(env.LQNG_KV, nowIso)
      const dayAgo = Date.now() - 24 * 3600_000
      const eventCounts: Record<string, number> = {}
      for (const e of state.events.items) {
        if (new Date(e.at).getTime() < dayAgo) break
        eventCounts[e.kind] = (eventCounts[e.kind] ?? 0) + 1
      }
      const lastRun = state.events.lastRun
      return Response.json(
        {
          time: nowIso,
          config: { enabled: state.config.enabled, pollTags: state.config.pollTags.length, titleNeedles: state.config.titleNeedles.length, keywordNeedles: state.config.keywordNeedles.length, tagGroups: state.config.tagGroups.length, allowlistAuthors: state.config.allowlist.authorIds.length },
          tracking: { lastPollAt: state.tracking.lastPollAt, lastSweepDate: state.tracking.lastSweepDate, authors: Object.keys(state.tracking.authors).length, pending: state.tracking.pending.length },
          verdicts: { authors: Object.keys(state.verdicts.authors).length, videos: Object.keys(state.verdicts.videos).length, updatedAt: state.verdicts.updatedAt },
          lastRun: lastRun ? { at: lastRun.at, mode: lastRun.mode, newVideos: lastRun.newVideos, enriched: lastRun.enriched, usersChecked: lastRun.usersChecked, subrequests: lastRun.subrequests, kvWrites: lastRun.kvWrites, note: lastRun.note ?? null } : null,
          eventsLast24h: eventCounts,
          lockHeld: (await env.LQNG_KV.get('lqng:lock')) !== null,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    // 手動実行（デバッグ・初回投入用）。WORKER_AUTH_KEY で保護
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const auth = request.headers.get('Authorization')
      if (!env.WORKER_AUTH_KEY || auth !== `Bearer ${env.WORKER_AUTH_KEY}`) {
        return new Response('Unauthorized', { status: 401 })
      }
      const modeParam = url.searchParams.get('mode')
      // 過去分のバックフィル（駆動は scripts/lqng-backfill-driver.ts）。走査は KV を書かず、commit だけが書く
      if (modeParam === 'backfill' || modeParam === 'backfill-commit') {
        try {
          const body = (await request.json().catch(() => ({}))) as { cursor?: BackfillCursor | null; pages?: number; days?: number | null; deltas?: BackfillDeltas }
          if (modeParam === 'backfill') {
            return Response.json(await runBackfillStep(env.LQNG_KV, createLiveBackfillDeps(), body.cursor ?? null, { pages: body.pages, days: body.days ?? null }))
          }
          return Response.json(await commitBackfill(env.LQNG_KV, new Date(), body.deltas ?? emptyDeltas()))
        } catch (error) {
          captureWorkerException(error, {
            tags: { runtime: 'cloudflare-worker', surface: 'lqng-poller', endpoint_family: 'trigger', worker_version: 'lqng-poller', mode: modeParam },
          })
          return Response.json({ error: error instanceof Error ? error.message : 'error' }, { status: 500 })
        }
      }
      const mode: RunMode = modeParam === 'sweep' ? 'sweep' : 'poll'
      try {
        return Response.json(await run(env, mode))
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'error' }, { status: 500 })
      }
    }
    return new Response('Not Found', { status: 404 })
  },
}

export default Sentry.withSentry((env: Env) => createWorkerSentryOptions(env), handler)
