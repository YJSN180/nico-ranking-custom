import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// 合成データのみ。実在のタイトル・タグ・ID は使わない
const store = new Map<string, unknown>()
const failing = new Set<string>()
const kvSet = vi.fn()
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    getStrict: vi.fn(async (key: string) => {
      if (failing.has(key)) throw new Error(`KV get failed: 503 (${key})`)
      return store.has(key) ? store.get(key) : null
    }),
    set: (key: string, value: unknown) => kvSet(key, value),
  },
}))

import { POST as postImpact } from '@/app/api/admin/lqng/impact/route'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import type { LqngImpact } from '@/lib/lqng/impact'

const savedConfig = {
  version: 1,
  enabled: true,
  pollTags: ['t1'],
  titleNeedles: ['てすとまん'],
  keywordNeedles: [],
  tagGroups: [['g1'], ['g2'], ['g3']],
  lockGroupsMin: 3,
  // KV の許可リスト（下書きに無くてもこちらを使う）
  allowlist: { authorIds: ['9001'], videoIds: [] },
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const rankingItem = (id: string, title: string, authorId = `a-${id}`) => ({ rank: 1, id, title, thumbURL: '', views: 0, authorId })
const rankings: Record<string, unknown[]> = {
  '24h': [rankingItem('sm1', 'ま/ん/ま/る 新作'), rankingItem('sm2', '普通の動画'), rankingItem('sm3', 'まんまる', '9001')],
  hour: [rankingItem('sm1', 'ま/ん/ま/る 新作'), rankingItem('sm4', 'まんまる二')],
}

const fetchMock = vi.fn()
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const impactRequest = (body: unknown, auth = true) =>
  new NextRequest('http://localhost/api/admin/lqng/impact', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Basic x' } : {}) },
  })

describe('POST /api/admin/lqng/impact', () => {
  beforeEach(() => {
    store.clear()
    failing.clear()
    vi.clearAllMocks()
    store.set(LQNG_KV_KEYS.config, savedConfig)
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url)
      if (u.pathname !== '/api/ranking' || u.searchParams.get('genre') !== 'all') return jsonResponse({ error: 'not found' }, 404)
      return jsonResponse({ items: rankings[u.searchParams.get('period') ?? ''] ?? [] })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('認証なしは 401', async () => {
    expect((await postImpact(impactRequest({ ...savedConfig }, false))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('公開中の総合ランキング（24 時間と毎時）に下書きを当て、規則ごとの本数と例を返す（KV は書かない）', async () => {
    const res = await postImpact(impactRequest({ ...savedConfig, titleNeedles: ['まんまる'], allowlist: { authorIds: [], videoIds: [] } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const body = (await res.json()) as LqngImpact
    // sm1 は両方の期間に載るので 1 本。sm3 は KV の許可リストの投稿者なので数えない（下書きの許可リストは使わない）
    expect(body.evaluated).toBe(4)
    expect(body.hidden).toBe(2)
    expect(body.rules[0]).toEqual({ rule: 'B', count: 2, examples: [{ id: 'sm1', title: 'ま/ん/ま/る 新作' }, { id: 'sm4', title: 'まんまる二' }] })
    const urls = fetchMock.mock.calls.map((c) => new URL(String(c[0])))
    expect(urls.map((u) => `${u.origin}${u.pathname}?${u.searchParams.toString()}`).sort()).toEqual([
      'http://localhost/api/ranking?genre=all&period=24h',
      'http://localhost/api/ranking?genre=all&period=hour',
    ])
    expect(kvSet).not.toHaveBeenCalled()
  })

  it('不正な本文や、保存できない下書き（短すぎる照合語など）は 400 で理由を返す', async () => {
    expect((await postImpact(impactRequest('{'))).status).toBe(400)
    expect((await postImpact(impactRequest([1]))).status).toBe(400)
    const res = await postImpact(impactRequest({ ...savedConfig, titleNeedles: ['まん'] }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { problems: string[] }).problems.length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('KV の設定（許可リスト）を読めなければ 503、公開中のランキングを読めなければ 502', async () => {
    failing.add(LQNG_KV_KEYS.config)
    expect((await postImpact(impactRequest({ ...savedConfig }))).status).toBe(503)
    failing.clear()
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'down' }, 500))
    expect((await postImpact(impactRequest({ ...savedConfig }))).status).toBe(502)
    fetchMock.mockImplementation(async () => jsonResponse({ unexpected: true }))
    expect((await postImpact(impactRequest({ ...savedConfig }))).status).toBe(502)
  })
})
