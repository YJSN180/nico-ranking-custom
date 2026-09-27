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

describe('lqng-poller の wrangler.toml', () => {
  it('cron はポーリングと日次スイープの 2 つで、スイープは Worker の SWEEP_CRON と同じ文字列', () => {
    const config = unstable_readConfig({ config: CONFIG_PATH })
    expect(config.triggers.crons).toEqual([POLL_CRON, SWEEP_CRON])
  })
})
