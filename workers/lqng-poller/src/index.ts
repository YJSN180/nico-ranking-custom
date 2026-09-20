// 粗悪コンテンツ自動NG ポーリング Worker（Cloudflare cron）
// - */15 * * * *  : nvapi 新着の差分取得 → 補完 → 判定 → KV の判定テーブル更新
// - 10 20 * * *   : 05:10 JST に Snapshot「前日分」のタイトルスイープ
// 判定ロジックは lib/lqng（Next.js と共用）。設定・許可リストは KV lqng:config（管理画面で編集）。
import { Sentry, captureWorkerException, createWorkerSentryOptions } from '../../sentry.js'
import { runPoll, type RunMode, type RunResult } from './poll'
import { createLiveDeps } from './sources'
import type { KvLike } from './state'

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
    // 手動実行（デバッグ・初回投入用）。WORKER_AUTH_KEY で保護
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const auth = request.headers.get('Authorization')
      if (!env.WORKER_AUTH_KEY || auth !== `Bearer ${env.WORKER_AUTH_KEY}`) {
        return new Response('Unauthorized', { status: 401 })
      }
      const mode: RunMode = url.searchParams.get('mode') === 'sweep' ? 'sweep' : 'poll'
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
