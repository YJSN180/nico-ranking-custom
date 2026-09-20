import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const store = new Map<string, unknown>()
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
    }),
  },
}))

import { GET as getOverview } from '@/app/api/admin/lqng/overview/route'
import { GET as getConfig, PUT as putConfig } from '@/app/api/admin/lqng/config/route'
import { POST as postAllowlist } from '@/app/api/admin/lqng/allowlist/route'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'

const authed = (url: string, init?: RequestInit) => new NextRequest(`http://localhost${url}`, { ...init, headers: { authorization: 'Basic x', 'content-type': 'application/json', ...(init?.headers ?? {}) } })

describe('admin lqng API', () => {
  beforeEach(() => {
    store.clear()
    vi.clearAllMocks()
  })

  it('認証なしは 401', async () => {
    expect((await getOverview(new NextRequest('http://localhost/api/admin/lqng/overview'))).status).toBe(401)
    expect((await getConfig(new NextRequest('http://localhost/api/admin/lqng/config'))).status).toBe(401)
    expect((await putConfig(new NextRequest('http://localhost/api/admin/lqng/config', { method: 'PUT' }))).status).toBe(401)
    expect((await postAllowlist(new NextRequest('http://localhost/api/admin/lqng/allowlist', { method: 'POST' }))).status).toBe(401)
  })

  it('overview は設定・判定・イベント・追跡要約を返し、no-store を付ける', async () => {
    store.set(LQNG_KV_KEYS.config, { enabled: true, titleNeedles: ['x'] })
    store.set(LQNG_KV_KEYS.verdicts, { version: 1, authors: { '1': { status: 'ng', reasons: ['B'], since: 't', evidence: [] } }, videos: {}, updatedAt: 't' })
    store.set(LQNG_KV_KEYS.tracking, { lastPollAt: 'p', lastSweepDate: 'd', authors: { '1': {}, '2': {} }, pending: [{}] })
    store.set(LQNG_KV_KEYS.events, { items: [{ kind: 'poll' }], lastRun: { at: 'p' } })
    const res = await getOverview(authed('/api/admin/lqng/overview'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const body = await res.json()
    expect(body.config.enabled).toBe(true)
    expect(body.config.titleNeedles).toEqual(['x'])
    expect(Object.keys(body.verdicts.authors)).toEqual(['1'])
    expect(body.tracking).toEqual({ lastPollAt: 'p', lastSweepDate: 'd', trackedAuthors: 2, pendingVideos: 1 })
    expect(body.events.items).toHaveLength(1)
    expect(body.envEnabled).toBe(true)
  })

  it('config PUT は正規化して保存し、不正な形は 400', async () => {
    const res = await putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: JSON.stringify({ enabled: true, tagGroups: [['a', 'a'], []], freq: { dayCount: 0 } }) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config.tagGroups).toEqual([['a']])
    expect(body.config.freq.dayCount).toBe(1)
    const saved = store.get(LQNG_KV_KEYS.config) as { enabled: boolean; updatedAt: string }
    expect(saved.enabled).toBe(true)
    expect(saved.updatedAt).not.toBe('1970-01-01T00:00:00.000Z')

    expect((await putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: '[1]' }))).status).toBe(400)
    expect((await putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: '{' }))).status).toBe(400)
  })

  it('allowlist POST は追加・削除とメモを扱い、ID 形式を検証する', async () => {
    store.set(LQNG_KV_KEYS.config, { enabled: true, allowlist: { authorIds: ['1'], videoIds: [] } })
    const add = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'author', id: '22', note: '確認済み' }) }))
    expect(add.status).toBe(200)
    expect((await add.json()).allowlist).toEqual({ authorIds: ['1', '22'], videoIds: [], notes: { '22': '確認済み' } })

    const addVideo = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'video', id: 'sm9' }) }))
    expect((await addVideo.json()).allowlist.videoIds).toEqual(['sm9'])

    const remove = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'remove', kind: 'author', id: '22' }) }))
    expect((await remove.json()).allowlist).toEqual({ authorIds: ['1'], videoIds: ['sm9'], notes: {} })

    const bad = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'author', id: 'not-an-id' }) }))
    expect(bad.status).toBe(400)
  })
})
