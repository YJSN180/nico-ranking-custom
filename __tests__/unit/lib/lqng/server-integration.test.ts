import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// KV をキー→値の表でモックし、getServerNGList / filterRankingItemsServer に自動NGが合流することを確認する
// failing に入れたキーは読み取り失敗（get は従来どおり null、getStrict は例外）にする
const store = new Map<string, unknown>()
const failing = new Set<string>()
const kvGet = vi.fn(async (key: string) => (failing.has(key) ? null : store.has(key) ? store.get(key) : null))
const kvGetStrict = vi.fn(async (key: string) => {
  if (failing.has(key)) throw new Error(`kv down: ${key}`)
  return store.has(key) ? store.get(key) : null
})
const kvSet = vi.fn(async (key: string, value: unknown) => {
  store.set(key, value)
})
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: (key: string) => kvGet(key),
    getStrict: (key: string) => kvGetStrict(key),
    set: (key: string, value: unknown) => kvSet(key, value),
  },
}))

import { getServerNGList, invalidateServerNGListCache } from '@/lib/ng-list-server'
import { resetLqngServerState } from '@/lib/lqng/server'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import type { RankingItem } from '@/types/ranking'

const now = new Date().toISOString()
const manual = { videoIds: ['sm-manual'], videoTitles: { exact: [], partial: [] }, authorIds: ['7'], authorNames: { exact: [], partial: [] } }
const config = {
  enabled: true,
  titleNeedles: ['てすとまん'],
  tagGroups: [['g1'], ['g2'], ['g3']],
  lockGroupsMin: 3,
  allowlist: { authorIds: ['9001'], videoIds: [] },
}
const verdicts = {
  version: 1,
  updatedAt: now,
  authors: {
    '1001': { status: 'ng', reasons: ['B'], since: now, evidence: [] },
    '9001': { status: 'ng', reasons: ['D'], since: now, evidence: [] },
  },
  videos: {
    'sm-auto': { status: 'ng', reasons: ['D'], authorId: '2001', title: 't', registeredAt: now, since: now },
  },
}

const item = (over: Partial<RankingItem>): RankingItem => ({ rank: 0, id: 'sm0', title: '通常', thumbURL: '', views: 0, ...over })

describe('lqng server integration', () => {
  beforeEach(() => {
    store.clear()
    failing.clear()
    resetLqngServerState()
    store.set('ng-list-manual', manual)
    store.set('ng-list-derived', ['sm-derived'])
    store.set(LQNG_KV_KEYS.config, config)
    store.set(LQNG_KV_KEYS.verdicts, verdicts)
    invalidateServerNGListCache()
    delete process.env.LQNG_ENABLED
  })
  afterEach(() => {
    delete process.env.LQNG_ENABLED
  })

  it('判定テーブルの投稿者・動画が許可リストを除いて合流する', async () => {
    const list = await getServerNGList()
    expect(list.authorIds).toEqual(['7'])
    expect(list.autoAuthorIds).toEqual(['1001'])
    expect(list.autoVideoIds).toEqual(['sm-auto'])
  })

  it('LQNG_ENABLED=false なら合流もリクエスト時ルールも行わない', async () => {
    process.env.LQNG_ENABLED = 'false'
    const list = await getServerNGList()
    expect(list.autoAuthorIds).toBeUndefined()
    const { filteredItems } = await filterRankingItemsServer([item({ id: 'sm1', title: 'て・す・と・ま・ん' }), item({ id: 'sm2', authorId: '1001' })])
    expect(filteredItems.map((i) => i.id)).toEqual(['sm1', 'sm2'])
  })

  it('判定テーブルが無ければ欄を足さず、従来どおりの形を返す', async () => {
    store.delete(LQNG_KV_KEYS.verdicts)
    const list = await getServerNGList()
    expect(list).not.toHaveProperty('autoAuthorIds')
  })

  it('filterRankingItemsServer は 手動NG → 派生NG → 自動NG → リクエスト時ルール の順で落とす', async () => {
    const items = [
      item({ id: 'sm-manual' }),
      item({ id: 'sm-derived' }),
      item({ id: 'sm-auto' }),
      item({ id: 'sm3', authorId: '1001' }),
      item({ id: 'sm4', title: 'て/す/と/ま/ん' }),
      item({ id: 'sm5', tagDetails: [{ name: 'g1', isLocked: true }, { name: 'g2', isLocked: true }, { name: 'g3', isLocked: true }] }),
      item({ id: 'sm6', title: 'てすとまん', authorId: '9001' }), // 許可リスト
      item({ id: 'sm7', authorId: '7' }), // 手動NG（派生に積まれる）
      item({ id: 'sm8' }),
    ]
    const result = await filterRankingItemsServer(items)
    expect(result.filteredItems.map((i) => i.id)).toEqual(['sm6', 'sm8'])
    expect(result.filteredItems.map((i) => i.rank)).toEqual([1, 2])
    expect(result.filteredCount).toBe(7)
    // 自動NG・リクエスト時ルールで落とした分は派生NGに積まない（手動NG由来の sm7 だけ）
    expect(result.newDerivedIds).toEqual(['sm7'])
  })

  it('KV 読み取りが失敗しても自動NGなしで応答する', async () => {
    failing.add(LQNG_KV_KEYS.config)
    const list = await getServerNGList()
    expect(list.authorIds).toEqual(['7'])
    expect(list.autoAuthorIds).toBeUndefined()
  })
})
