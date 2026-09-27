// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

// Worker 経由の印（X-Worker-Auth）の比較。共有キーは合成値のみ
const WORKER_KEY = 'synthetic-worker-key-0123456789'
const page = (workerKey?: string) =>
  middleware(new NextRequest('https://nico-rank.com/', { headers: workerKey ? { 'X-Worker-Auth': workerKey } : {} }))

describe('middleware: X-Worker-Auth', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('WORKER_AUTH_KEY', WORKER_KEY)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('一致すれば従来どおり先へ進める（以降の見出しを付けない）', async () => {
    const res = await page(WORKER_KEY)

    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('x-frame-options')).toBeNull()
  })

  it.each([
    ['末尾だけ違う', 'synthetic-worker-key-012345678X'],
    ['前方一致', 'synthetic-worker-key'],
  ])('%s なら Worker 経由として扱わない', async (_label, workerKey) => {
    const res = await page(workerKey)

    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('共有キーは定数時間で比べる（送られた値と正しい値をハッシュして比べる）', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest')

    await page('synthetic-worker-key-012345678X')

    expect(digest).toHaveBeenCalledTimes(2)
  })
})
