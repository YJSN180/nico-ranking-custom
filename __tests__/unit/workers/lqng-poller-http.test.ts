// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
}))
import worker from '../../../workers/lqng-poller/src/index'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import type { LqngConfig } from '@/lib/lqng/types'
import type { LqngTracking, TrackedAuthor } from '@/workers/lqng-poller/src/state'
import { memoryKv } from './helpers/lqng-memory-kv'

// 合成データのみ。実在の ID・名前・タグは使わない

const AUTH_KEY = 'test-key'
const fetchWorker = worker.fetch as unknown as (request: Request, env: unknown) => Promise<Response>

const config: Partial<LqngConfig> = {
  enabled: true,
  pollTags: ['tagA'],
  tagGroups: [['g1'], ['g2'], ['g3']],
  allowlist: { authorIds: [], videoIds: [] },
}

const trackedAuthor = (authorId: string): TrackedAuthor => ({
  authorId,
  firstSeenAt: '2026-02-01T00:00:00.000Z',
  lastPostAt: '2026-02-01T00:00:00.000Z',
  posts: [{ id: 'sm1', title: 't', at: '2026-02-01T00:00:00.000Z', tagDetails: [{ name: 'g1', isLocked: true }], ownerVisibility: 'visible' }],
  status: 'existing',
  lastCheckedAt: null,
  followerCount: 3,
  nickname: 'n',
  visibility: 'visible',
  deletedObservedAt: null,
})

function setup() {
  const tracking: LqngTracking = {
    version: 1,
    lastPollAt: null,
    lastSweepDate: null,
    authors: { '1001': trackedAuthor('1001'), 'channel/ch55': trackedAuthor('channel/ch55') },
    pending: [],
    updatedAt: '2026-02-01T00:00:00.000Z',
  }
  const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: tracking })
  const env = { LQNG_KV: m.kv, WORKER_AUTH_KEY: AUTH_KEY }
  return { m, env }
}

const pageHtml = (items: Array<Record<string, unknown>>) => {
  const payload = { data: { response: { $getSearchVideoV2: { data: { totalCount: items.length, hasNext: false, items } } } } }
  const attr = JSON.stringify(payload).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<html><head><meta name="server-response" content="${attr}"></head></html>`
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('lqng-poller /status', () => {
  it('probe は認証なしの /status では実行しない（外部へ取りに行かない）', async () => {
    const { env } = setup()
    const upstream = vi.fn(async () => new Response(pageHtml([]), { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const res = await fetchWorker(new Request('https://w.test/status?probe=pages&sinceMinutes=60'), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.probe).toBeUndefined()
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each(['constructor', '__proto__', 'toString', 'abc', '1234567890123', 'channel/ch', 'channel/chx1', 'ch55', '12 34', ''])(
    'author=%s は 400 を返す',
    async (author) => {
      const { env } = setup()
      const res = await fetchWorker(new Request(`https://w.test/status?author=${encodeURIComponent(author)}`), env)
      expect(res.status).toBe(400)
    }
  )

  it('数字の ID と channel/ch＋数字は受け付け、追跡・判定の件数だけを返す', async () => {
    const { env } = setup()
    const user = await fetchWorker(new Request('https://w.test/status?author=1001'), env)
    expect(user.status).toBe(200)
    const userBody = (await user.json()) as { author: { id: string; tracked: { posts: number; lockedGroupsMax: number } | null; verdict: unknown } }
    expect(userBody.author.id).toBe('1001')
    expect(userBody.author.tracked?.posts).toBe(1)
    expect(userBody.author.tracked?.lockedGroupsMax).toBe(1)
    expect(userBody.author.verdict).toBeNull()

    const channel = await fetchWorker(new Request(`https://w.test/status?author=${encodeURIComponent('channel/ch55')}`), env)
    expect(channel.status).toBe(200)
    const channelBody = (await channel.json()) as { author: { id: string; tracked: unknown } }
    expect(channelBody.author.tracked).not.toBeNull()

    const unknown = await fetchWorker(new Request('https://w.test/status?author=2002'), env)
    const unknownBody = (await unknown.json()) as { author: { tracked: unknown; verdict: unknown } }
    expect(unknownBody.author.tracked).toBeNull()
    expect(unknownBody.author.verdict).toBeNull()
  })
})

describe('lqng-poller /trigger?mode=probe', () => {
  it('認証が無ければ 401 で、外部へ取りに行かない', async () => {
    const { env } = setup()
    const upstream = vi.fn(async () => new Response(pageHtml([]), { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const res = await fetchWorker(new Request('https://w.test/trigger?mode=probe&source=pages', { method: 'POST' }), env)
    expect(res.status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('認証付きなら新着取得を試し、件数と時刻だけを返す（KV は書かない）', async () => {
    const { m, env } = setup()
    const recent = new Date(Date.now() - 5 * 60_000).toISOString()
    const upstream = vi.fn(async () => new Response(pageHtml([{ id: 'sm9', title: 't', registeredAt: recent, owner: { ownerType: 'user', id: '1001', name: 'n', visibility: 'visible' } }]), { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const res = await fetchWorker(
      new Request('https://w.test/trigger?mode=probe&source=pages&sinceMinutes=60', { method: 'POST', headers: { Authorization: `Bearer ${AUTH_KEY}` } }),
      env
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { probe: { source: string; ok: boolean; count: number; last: string | null } }
    expect(body.probe.source).toBe('pages')
    expect(body.probe.ok).toBe(true)
    expect(body.probe.count).toBe(1)
    expect(body.probe.last).toBe(recent)
    expect(upstream).toHaveBeenCalled()
    expect(m.puts).toEqual([])
  })
})
