// 粗悪コンテンツ自動NG ポーリング Worker（Cloudflare cron）
// - */15 * * * *  : nvapi 新着の差分取得 → 補完 → 判定 → KV の判定テーブル更新
// - 10 20 * * *   : 05:10 JST に Snapshot「前日分」のタイトルスイープ
// 判定ロジックは lib/lqng（Next.js と共用）。設定・許可リストは KV lqng:config（管理画面で編集）。
import { Sentry, captureWorkerException, createWorkerSentryOptions } from '../../sentry.js'
import { countLockedGroups } from '../../../lib/lqng/rules'
import { commitBackfill, createLiveBackfillDeps, runBackfillStep, type BackfillCursor } from './backfill'
import { InvalidInboxRefError } from './inbox'
import { runPoll, type RunMode, type RunResult } from './poll'
import { createLiveDeps, fetchNewVideosFromNicoPages, fetchNewVideosFromNvapi } from './sources'
import { loadConfig, loadState, type KvLike } from './state'

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

/** /status?author= が受け付ける投稿者 ID（ユーザーは数字、チャンネルは channel/ch＋数字） */
const AUTHOR_ID_PATTERN = /^(?:\d{1,12}|channel\/ch\d{1,12})$/

const NO_STORE = { 'Cache-Control': 'no-store' }

/** ポーラーと同じ条件で新着取得を試し、件数と時刻だけ返す（診断用。KV は書かない） */
async function probeNewVideos(request: Request, env: Env, url: URL): Promise<Response> {
  const source = url.searchParams.get('source') === 'nvapi' ? 'nvapi' : 'pages'
  const minutes = Math.max(1, Math.min(24 * 60, Number(url.searchParams.get('sinceMinutes')) || 60))
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const cf = (request as Request & { cf?: { colo?: string; country?: string } }).cf
  const where = { colo: cf?.colo ?? null, country: cf?.country ?? null }
  const { pollTags } = await loadConfig(env.LQNG_KV)
  try {
    const { videos, failures } = source === 'pages' ? await fetchNewVideosFromNicoPages(pollTags, since) : { videos: await fetchNewVideosFromNvapi(pollTags, since), failures: [] }
    const times = videos.map((v) => v.registeredAt).sort()
    return Response.json({ probe: { source, ok: true, since, count: videos.length, first: times[0] ?? null, last: times[times.length - 1] ?? null, failures, ...where } }, { headers: NO_STORE })
  } catch (error) {
    return Response.json({ probe: { source, ok: false, since, error: error instanceof Error ? error.message : 'error', ...where } }, { headers: NO_STORE })
  }
}

async function run(env: Env, mode: RunMode): Promise<RunResult> {
  const tags = { runtime: 'cloudflare-worker', surface: 'lqng-poller', endpoint_family: 'scheduled', worker_version: 'lqng-poller', mode }
  // 実行を止めない失敗（新着を主経路・予備とも取れなかったなど）も監視に上げる
  const reportError = (error: unknown, context: string): void => {
    captureWorkerException(error, { tags: { ...tags, operation: context } })
  }
  try {
    return await runPoll(env.LQNG_KV, { ...createLiveDeps(), reportError }, mode)
  } catch (error) {
    captureWorkerException(error, { tags })
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
    // 運用確認用（認証なし）。件数と直近の実行サマリだけを返し、ID・名前・タイトルは含めない。
    // 外部への取得（probe）は認証付きの /trigger?mode=probe に置く
    if (url.pathname === '/status') {
      // ?author=ID で、その投稿者の追跡・判定状態（件数と状態のみ。名前・タイトルは返さない）
      const authorId = url.searchParams.get('author')
      if (authorId !== null && !AUTHOR_ID_PATTERN.test(authorId)) {
        return Response.json({ error: 'invalid author id' }, { status: 400, headers: NO_STORE })
      }
      const nowIso = new Date().toISOString()
      const state = await loadState(env.LQNG_KV, nowIso)
      const dayAgo = Date.now() - 24 * 3600_000
      const eventCounts: Record<string, number> = {}
      for (const e of state.events.items) {
        if (new Date(e.at).getTime() < dayAgo) break
        eventCounts[e.kind] = (eventCounts[e.kind] ?? 0) + 1
      }
      const lastRun = state.tracking.lastRun
      // KV の JSON をそのまま引くので、constructor などの継承プロパティを拾わないよう自前のキーだけを見る
      const tracked = authorId !== null && Object.hasOwn(state.tracking.authors, authorId) ? state.tracking.authors[authorId] : undefined
      const authorVerdict = authorId !== null && Object.hasOwn(state.verdicts.authors, authorId) ? state.verdicts.authors[authorId] : undefined
      const videoStatuses: Record<string, number> = {}
      if (authorId !== null) {
        for (const v of Object.values(state.verdicts.videos)) {
          if (v.authorId === authorId) videoStatuses[v.status] = (videoStatuses[v.status] ?? 0) + 1
        }
      }
      const author = authorId !== null
        ? {
            id: authorId,
            allowlisted: state.config.allowlist.authorIds.includes(authorId),
            tracked: tracked
              ? {
                  status: tracked.status,
                  posts: tracked.posts.length,
                  enrichedPosts: tracked.posts.filter((post) => post.tagDetails !== null).length,
                  lockedGroupsMax: Math.max(0, ...tracked.posts.map((post) => countLockedGroups(post.tagDetails, state.config.tagGroups))),
                  firstSeenAt: tracked.firstSeenAt,
                  lastPostAt: tracked.lastPostAt,
                  lastCheckedAt: tracked.lastCheckedAt,
                  followerCount: tracked.followerCount,
                  visibility: tracked.visibility,
                  deletedObservedAt: tracked.deletedObservedAt,
                  deletionSuspectedAt: tracked.deletionSuspectedAt ?? null,
                }
              : null,
            verdict: authorVerdict ? { status: authorVerdict.status, reasons: authorVerdict.reasons, since: authorVerdict.since } : null,
            videoVerdicts: videoStatuses,
            pending: state.tracking.pending.filter((item) => item.authorId === authorId).length,
          }
        : undefined
      return Response.json(
        {
          time: nowIso,
          ...(author ? { author } : {}),
          config: { enabled: state.config.enabled, pollTags: state.config.pollTags.length, titleNeedles: state.config.titleNeedles.length, keywordNeedles: state.config.keywordNeedles.length, tagGroups: state.config.tagGroups.length, allowlistAuthors: state.config.allowlist.authorIds.length },
          tracking: {
            lastPollAt: state.tracking.lastPollAt,
            lastSweepDate: state.tracking.lastSweepDate,
            authors: Object.keys(state.tracking.authors).length,
            pending: state.tracking.pending.length,
            // 退会の疑い（1 回目の 404）と退会扱いの人数
            deletionSuspected: Object.values(state.tracking.authors).filter((a) => a.deletionSuspectedAt).length,
            deleted: Object.values(state.tracking.authors).filter((a) => a.status === 'deleted').length,
          },
          verdicts: { authors: Object.keys(state.verdicts.authors).length, videos: Object.keys(state.verdicts.videos).length, updatedAt: state.verdicts.updatedAt },
          lastRun: lastRun ? { at: lastRun.at, mode: lastRun.mode, newVideos: lastRun.newVideos, enriched: lastRun.enriched, usersChecked: lastRun.usersChecked, subrequests: lastRun.subrequests, kvWrites: lastRun.kvWrites, note: lastRun.note ?? null } : null,
          eventsLast24h: eventCounts,
          // 直近の実行の時刻と注記（追跡表に持つ）と、直近イベントの種別だけの時系列
          recentRuns: state.tracking.recentRuns.map((r) => ({ at: r.at, kind: r.mode, note: r.note ?? null })),
          recentEvents: state.events.items.slice(0, 60).map((e) => ({ at: e.at, kind: e.kind, ...(e.kind === 'access_limited' || e.kind === 'error' || e.kind === 'backfill' || e.kind === 'deletion_held' ? { note: e.note ?? null } : {}) })),
        },
        { headers: NO_STORE }
      )
    }
    // 手動実行（デバッグ・初回投入用）。WORKER_AUTH_KEY で保護
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const auth = request.headers.get('Authorization')
      if (!env.WORKER_AUTH_KEY || auth !== `Bearer ${env.WORKER_AUTH_KEY}`) {
        return new Response('Unauthorized', { status: 401 })
      }
      const modeParam = url.searchParams.get('mode')
      // 診断: ?mode=probe&source=pages|nvapi[&sinceMinutes=N]
      if (modeParam === 'probe') return probeNewVideos(request, env, url)
      // 過去分のバックフィル（駆動は scripts/lqng-backfill-driver.ts）。走査は KV を書かず、
      // commit は判定差分を受け箱（lqng:inbox:<runId>:<seq>）に 1 回置くだけ（判定表へは次のポーリングが合流）
      if (modeParam === 'backfill' || modeParam === 'backfill-commit') {
        try {
          const body = (await request.json().catch(() => ({}))) as { cursor?: BackfillCursor | null; pages?: number; days?: number | null; source?: 'snapshot' | 'pages'; deltas?: unknown; runId?: unknown; seq?: unknown }
          if (modeParam === 'backfill') {
            return Response.json(await runBackfillStep(env.LQNG_KV, createLiveBackfillDeps(), body.cursor ?? null, { pages: body.pages, days: body.days ?? null, source: body.source === 'pages' ? 'pages' : 'snapshot' }))
          }
          // runId・seq を送らない旧い駆動スクリプトでも受け付ける（1 回ごとに別のキーになる）
          const runId = typeof body.runId === 'string' ? body.runId : `legacy-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
          const seq = typeof body.seq === 'number' ? body.seq : 0
          return Response.json(await commitBackfill(env.LQNG_KV, new Date(), body.deltas, { runId, seq }))
        } catch (error) {
          if (error instanceof InvalidInboxRefError) return Response.json({ error: error.message }, { status: 400 })
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
