import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const store = new Map<string, unknown>()
// failing に入れたキーは読み取り失敗（429 の連続・5xx など）、`set:<key>` は書き込み失敗にする
const failing = new Set<string>()
const kvSet = vi.fn(async (key: string, value: unknown) => {
  if (failing.has(`set:${key}`)) throw new Error('KV set failed: 429')
  store.set(key, value)
})
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    // 従来の get は失敗も null（未設定と区別できない）
    get: vi.fn(async (key: string) => (failing.has(key) ? null : store.has(key) ? store.get(key) : null)),
    getStrict: vi.fn(async (key: string) => {
      if (failing.has(key)) throw new Error(`KV get failed: 503 (${key})`)
      return store.has(key) ? store.get(key) : null
    }),
    set: (key: string, value: unknown) => kvSet(key, value),
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
    failing.clear()
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
    // 未設定（404）の版番号は既定値の updatedAt
    const res = await putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: JSON.stringify({ enabled: true, pollTags: ['t1'], tagGroups: [['a', 'a'], []], lockGroupsMin: 1, updatedAt: '1970-01-01T00:00:00.000Z' }) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config.tagGroups).toEqual([['a']])
    const saved = store.get(LQNG_KV_KEYS.config) as { enabled: boolean; updatedAt: string }
    expect(saved.enabled).toBe(true)
    expect(saved.updatedAt).not.toBe('1970-01-01T00:00:00.000Z')

    expect((await putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: '[1]' }))).status).toBe(400)
    expect((await putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: '{' }))).status).toBe(400)
  })

  it('config PUT は上限・下限や照合語の長さに反する値を黙って丸めず 400 で理由を返す', async () => {
    const base = { enabled: false, updatedAt: '1970-01-01T00:00:00.000Z' }
    const cases = [{ freq: { dayCount: 0 } }, { followerMax: 100000 }, { holdHours: 10000 }, { trackDays: 365 }, { titleNeedles: ['ab'] }, { enabled: true }]
    for (const override of cases) {
      const res = await putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: JSON.stringify({ ...base, ...override }) }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.problems.length).toBeGreaterThan(0)
    }
    expect(kvSet).not.toHaveBeenCalled()
  })

  it('allowlist POST は追加・削除とメモを扱い、ID 形式を検証する', async () => {
    store.set(LQNG_KV_KEYS.config, { enabled: true, allowlist: { authorIds: ['1'], videoIds: [] } })
    const add = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'author', id: '22', note: '確認済み' }) }))
    expect(add.status).toBe(200)
    expect((await add.json()).config.allowlist).toEqual({ authorIds: ['1', '22'], videoIds: [], notes: { '22': '確認済み' } })

    const addVideo = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'video', id: 'sm9' }) }))
    expect((await addVideo.json()).config.allowlist.videoIds).toEqual(['sm9'])

    const remove = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'remove', kind: 'author', id: '22' }) }))
    expect((await remove.json()).config.allowlist).toEqual({ authorIds: ['1'], videoIds: ['sm9'], notes: {} })

    const bad = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'author', id: 'not-an-id' }) }))
    expect(bad.status).toBe(400)
  })
  it('overview は設定・判定テーブルを読めなければ既定値を返さず 503', async () => {
    store.set(LQNG_KV_KEYS.config, { enabled: true, titleNeedles: ['x'] })
    failing.add(LQNG_KV_KEYS.config)
    const res = await getOverview(authed('/api/admin/lqng/overview'))
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).not.toHaveProperty('config')

    failing.clear()
    failing.add(LQNG_KV_KEYS.verdicts)
    expect((await getOverview(authed('/api/admin/lqng/overview'))).status).toBe(503)
  })

  it('overview は追跡・イベントの読み取り失敗だけなら 200 で空の要約を返す', async () => {
    failing.add(LQNG_KV_KEYS.tracking)
    failing.add(LQNG_KV_KEYS.events)
    const res = await getOverview(authed('/api/admin/lqng/overview'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tracking.lastPollAt).toBeNull()
    expect(body.events.items).toEqual([])
  })

  it('config GET は読み取り失敗を 503 にする', async () => {
    failing.add(LQNG_KV_KEYS.config)
    expect((await getConfig(authed('/api/admin/lqng/config'))).status).toBe(503)
  })

  it('allowlist POST は種別ごとに ID 形式を検証し、ショート（ss）の動画 ID も受け付ける', async () => {
    const post = (body: Record<string, string>) => postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify(body) }))
    for (const id of ['sm1', 'so2', 'nm3', 'ss4']) expect((await post({ action: 'add', kind: 'video', id })).status).toBe(200)
    for (const id of ['1', '123456789012', 'channel/ch12']) expect((await post({ action: 'add', kind: 'author', id })).status).toBe(200)
    expect((store.get(LQNG_KV_KEYS.config) as { allowlist: { videoIds: string[] } }).allowlist.videoIds).toEqual(['sm1', 'so2', 'nm3', 'ss4'])
    expect((await post({ action: 'remove', kind: 'video', id: 'ss4' })).status).toBe(200)

    // 種別と形式が合わない ID は 400（動画 ID を投稿者として、投稿者 ID を動画として登録しない）
    for (const id of ['sm9', 'ss9', 'ch12', 'channel/12', '1234567890123']) expect((await post({ action: 'add', kind: 'author', id })).status).toBe(400)
    for (const id of ['123', 'channel/ch1', 'sx1', 'ss', 'sm1234567890123']) expect((await post({ action: 'add', kind: 'video', id })).status).toBe(400)
  })

  it('allowlist POST は設定を読めなければ 503 を返し、既定値を土台に書き込まない', async () => {
    store.set(LQNG_KV_KEYS.config, { enabled: true, titleNeedles: ['てすとまん'], allowlist: { authorIds: ['1'], videoIds: [] } })
    failing.add(LQNG_KV_KEYS.config)
    const res = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'author', id: '22' }) }))
    expect(res.status).toBe(503)
    expect(kvSet).not.toHaveBeenCalled()
    expect(store.get(LQNG_KV_KEYS.config)).toMatchObject({ enabled: true, titleNeedles: ['てすとまん'] })
  })

  it('allowlist POST は未設定（404）なら既定値に 1 件足して保存する', async () => {
    const res = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'video', id: 'sm1' }) }))
    expect(res.status).toBe(200)
    expect((store.get(LQNG_KV_KEYS.config) as { allowlist: { videoIds: string[] } }).allowlist.videoIds).toEqual(['sm1'])
  })

  it('allowlist POST は KV への書き込み失敗を成功扱いにしない', async () => {
    failing.add(`set:${LQNG_KV_KEYS.config}`)
    const res = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'author', id: '22' }) }))
    expect(res.status).toBe(500)
    expect(await res.json()).not.toHaveProperty('success')
  })
  describe('config PUT の版番号と許可リスト', () => {
    const current = { enabled: true, pollTags: ['t1'], titleNeedles: ['てすとまん'], allowlist: { authorIds: ['1'], videoIds: ['sm9'], notes: { '1': 'メモ' } }, updatedAt: '2026-01-01T00:00:00.000Z' }
    const put = (body: unknown) => putConfig(authed('/api/admin/lqng/config', { method: 'PUT', body: JSON.stringify(body) }))

    it('版番号が一致すれば保存し、許可リストは PUT の内容を無視して KV の値を保つ', async () => {
      store.set(LQNG_KV_KEYS.config, current)
      const res = await put({ ...current, holdHours: 12, allowlist: { authorIds: [], videoIds: [] } })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.config.holdHours).toBe(12)
      expect(body.config.allowlist).toEqual(current.allowlist)
      expect(body.config.updatedAt).not.toBe(current.updatedAt)
      expect(store.get(LQNG_KV_KEYS.config)).toMatchObject({ holdHours: 12, allowlist: current.allowlist, updatedAt: body.config.updatedAt })
    })

    it('版番号が違えば 409 で書き込まない', async () => {
      store.set(LQNG_KV_KEYS.config, current)
      const res = await put({ ...current, holdHours: 12, updatedAt: '2025-12-31T00:00:00.000Z' })
      expect(res.status).toBe(409)
      expect(kvSet).not.toHaveBeenCalled()
      expect(store.get(LQNG_KV_KEYS.config)).toEqual(current)
    })

    it('許可リストの更新で版番号が進むので、古い版からの保存は 409 になる', async () => {
      store.set(LQNG_KV_KEYS.config, current)
      const add = await postAllowlist(authed('/api/admin/lqng/allowlist', { method: 'POST', body: JSON.stringify({ action: 'add', kind: 'author', id: '22' }) }))
      const addedConfig = (await add.json()).config
      expect((await put({ ...current, holdHours: 12 })).status).toBe(409)
      // 応答の最新の版からなら保存でき、追加した許可リストも消えない
      const res = await put({ ...addedConfig, holdHours: 12 })
      expect(res.status).toBe(200)
      expect((await res.json()).config.allowlist.authorIds).toEqual(['1', '22'])
    })

    it('版番号が無ければ 400', async () => {
      store.set(LQNG_KV_KEYS.config, current)
      const { updatedAt: _omit, ...withoutVersion } = current
      expect((await put(withoutVersion)).status).toBe(400)
      expect(kvSet).not.toHaveBeenCalled()
    })

    it('現在の設定を読めなければ 503 で書き込まない', async () => {
      store.set(LQNG_KV_KEYS.config, current)
      failing.add(LQNG_KV_KEYS.config)
      expect((await put({ ...current, holdHours: 12 })).status).toBe(503)
      expect(kvSet).not.toHaveBeenCalled()
    })
  })
})
