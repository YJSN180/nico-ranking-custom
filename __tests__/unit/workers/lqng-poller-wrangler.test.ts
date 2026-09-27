// @vitest-environment node
// lqng-poller の wrangler.toml を、wrangler 自身の読み取り（環境ごとの継承の規則を含む）で確かめる
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { unstable_readConfig } from 'wrangler'
vi.mock('../../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
}))
import { SWEEP_CRON } from '../../../workers/lqng-poller/src/index'

const CONFIG_PATH = fileURLToPath(new URL('../../../workers/lqng-poller/wrangler.toml', import.meta.url))
const POLL_CRON = '*/15 * * * *'
/** 本番の KV 名前空間（既存の値。ランキングなどと共用し、キーは lqng: 接頭辞で分ける） */
const PRODUCTION_KV_ID = '80f4535c379b4e8cb89ce6dbdb7d2dc9'

const read = (env?: string) => unstable_readConfig({ config: CONFIG_PATH, ...(env ? { env } : {}) })

describe('lqng-poller の wrangler.toml', () => {
  it('cron はポーリングと日次スイープの 2 つで、スイープは Worker の SWEEP_CRON と同じ文字列', () => {
    expect(read().triggers.crons).toEqual([POLL_CRON, SWEEP_CRON])
  })

  // 環境は束縛（kv_namespaces）と vars を引き継がない。無いまま --env production で出すと、KV の無い Worker になる
  it.each([['最上位（deploy-worker.yml が使う）', undefined], ['production', 'production']])('%s は本番の KV を LQNG_KV に束ね、本番として動く', (_label, env) => {
    const config = read(env)
    expect(config.name).toBe('lqng-poller')
    expect(config.kv_namespaces).toEqual([{ binding: 'LQNG_KV', id: PRODUCTION_KV_ID }])
    expect(config.vars).toEqual({ ENVIRONMENT: 'production' })
    expect(config.triggers.crons).toEqual([POLL_CRON, SWEEP_CRON])
  })

  it('staging は本番と別の Worker・別の KV（ID を書かず、初回のデプロイで作る）で、スケジュールでは動かさない', () => {
    const config = read('staging')
    expect(config.name).toBe('lqng-poller-staging')
    expect(config.kv_namespaces).toEqual([{ binding: 'LQNG_KV' }])
    expect(config.vars).toEqual({ ENVIRONMENT: 'staging' })
    expect(config.triggers.crons).toEqual([])
  })
})
