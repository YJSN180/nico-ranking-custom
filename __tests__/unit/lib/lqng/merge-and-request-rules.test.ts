import { describe, it, expect } from 'vitest'
import { collectAutoNg, mergeAutoNgIntoList } from '@/lib/lqng/merge'
import { applyRequestRules, lockTagRuleHits } from '@/lib/lqng/request-rules'
import { normalizeLqngConfig, normalizeLqngVerdicts, LQNG_KV_KEYS } from '@/lib/lqng/config'
import { DEFAULT_LQNG_CONFIG, type LqngConfig, type LqngVerdicts } from '@/lib/lqng/types'
import { filterWithNGListCore } from '@/lib/ng-filter-core'
import { createEmptyNGList } from '@/lib/ng-list-migration'
import type { RankingItem } from '@/types/ranking'

const config: LqngConfig = {
  ...DEFAULT_LQNG_CONFIG,
  enabled: true,
  titleNeedles: ['てすとまん'],
  tagGroups: [['g1'], ['g2'], ['g3'], ['g4']],
  lockGroupsMin: 3,
  allowlist: { authorIds: ['9001'], videoIds: ['sm9002'] },
}

const now = new Date('2026-01-10T12:00:00+09:00')
const later = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString()

const verdicts: LqngVerdicts = {
  version: 1,
  updatedAt: now.toISOString(),
  authors: {
    '1001': { status: 'ng', reasons: ['B'], since: now.toISOString(), evidence: [] },
    '9001': { status: 'ng', reasons: ['D'], since: now.toISOString(), evidence: [] }, // 許可リスト
  },
  videos: {
    sm1: { status: 'ng', reasons: ['D'], authorId: '2001', title: 't', registeredAt: now.toISOString(), since: now.toISOString() },
    sm2: { status: 'hold', reasons: [], holdSignals: ['low_followers'], authorId: '2002', title: 't', registeredAt: now.toISOString(), since: now.toISOString(), holdUntil: later(5) },
    sm3: { status: 'hold', reasons: [], holdSignals: ['hidden_owner'], authorId: '2003', title: 't', registeredAt: now.toISOString(), since: now.toISOString(), holdUntil: later(-1) }, // 期限切れ
    sm4: { status: 'released', reasons: [], authorId: '2004', title: 't', registeredAt: now.toISOString(), since: now.toISOString() },
    sm5: { status: 'ng', reasons: ['B'], authorId: '9001', title: 't', registeredAt: now.toISOString(), since: now.toISOString() }, // 許可投稿者の動画
    sm9002: { status: 'ng', reasons: ['B'], authorId: '2005', title: 't', registeredAt: now.toISOString(), since: now.toISOString() }, // 許可動画
  },
}

describe('collectAutoNg / mergeAutoNgIntoList', () => {
  it('確定と期限内の保留を集め、許可リストを除く', () => {
    const auto = collectAutoNg(verdicts, config, now)
    expect(auto.authorIds).toEqual(['1001'])
    expect(auto.videoIds.sort()).toEqual(['sm1', 'sm2'])
  })

  it('設定が無効か判定テーブルが無ければ空', () => {
    expect(collectAutoNg(verdicts, { ...config, enabled: false }, now)).toEqual({ authorIds: [], videoIds: [] })
    expect(collectAutoNg(null, config, now)).toEqual({ authorIds: [], videoIds: [] })
  })

  it('NG リストに autoAuthorIds / autoVideoIds として合流し、手動リストは変えない', () => {
    const manual = { ...createEmptyNGList(), authorIds: ['3001'] }
    const merged = mergeAutoNgIntoList(manual, collectAutoNg(verdicts, config, now))
    expect(merged.authorIds).toEqual(['3001'])
    expect(merged.autoAuthorIds).toEqual(['1001'])
    expect(merged.autoVideoIds?.sort()).toEqual(['sm1', 'sm2'])
  })
})

describe('filterWithNGListCore with auto NG', () => {
  const item = (id: string, authorId?: string): RankingItem => ({ rank: 0, id, title: 't', thumbURL: '', views: 0, authorId })

  it('自動 NG の投稿者・動画を落とし、派生 NG には積まない', () => {
    const ngList = { ...createEmptyNGList(), autoAuthorIds: ['1001'], autoVideoIds: ['sm1'] }
    const result = filterWithNGListCore([item('sm1', '5'), item('sm2', '1001'), item('sm3', '7')], ngList)
    expect(result.filteredItems.map((i) => i.id)).toEqual(['sm3'])
    expect(result.newDerivedIds).toEqual([])
  })

  it('手動 NG は自動 NG と独立に効く（派生 NG に積まれる従来動作は維持）', () => {
    const ngList = { ...createEmptyNGList(), authorIds: ['7'], autoVideoIds: [] }
    const result = filterWithNGListCore([item('sm3', '7'), item('sm4', '8')], ngList)
    expect(result.filteredItems.map((i) => i.id)).toEqual(['sm4'])
    expect(result.newDerivedIds).toEqual(['sm3'])
  })
})

describe('applyRequestRules', () => {
  const item = (over: Partial<RankingItem>): RankingItem => ({ rank: 0, id: 'sm0', title: '通常', thumbURL: '', views: 0, ...over })

  it('タイトル照合語（B）と tagDetails のあるロック群（D）で落とし、許可リストは通す', () => {
    const items = [
      item({ id: 'sm1', title: 'て・す・と・ま・ん' }),
      item({ id: 'sm2', tagDetails: [{ name: 'g1', isLocked: true }, { name: 'g2', isLocked: true }, { name: 'g3', isLocked: true }] }),
      item({ id: 'sm3', tags: ['g1', 'g2', 'g3'] }), // ロック情報なし → D は判定しない
      item({ id: 'sm4', title: 'てすとまん', authorId: '9001' }), // 許可投稿者
      item({ id: 'sm9002', title: 'てすとまん' }), // 許可動画
      item({ id: 'sm5', title: '無関係' }),
    ]
    const r = applyRequestRules(items, config)
    expect(r.items.map((i) => i.id)).toEqual(['sm3', 'sm4', 'sm9002', 'sm5'])
    expect(r.excludedCount).toBe(2)
    expect(r.excluded).toEqual({ sm1: ['B'], sm2: ['D'] })
  })

  it('設定が無い・無効・照合語もタグ群も無いときは素通し', () => {
    const items = [item({ id: 'sm1', title: 'てすとまん' })]
    expect(applyRequestRules(items, null).items).toHaveLength(1)
    expect(applyRequestRules(items, { ...config, enabled: false }).items).toHaveLength(1)
    expect(applyRequestRules(items, { ...config, titleNeedles: [], tagGroups: [] }).items).toHaveLength(1)
  })
})

describe('lockTagRuleHits（検索の新着区間のタグ補完後に D を当てる）', () => {
  const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))

  it('ロック済みのタグ群が閾値以上の動画だけを返し、許可リストの動画・投稿者は除く', () => {
    const videos = [
      { id: 'sm1', authorId: '2001', tagDetails: locked('g1', 'g2', 'g3') },
      { id: 'sm2', authorId: '2002', tagDetails: locked('g1', 'g2') },
      { id: 'sm3', authorId: '2003', tagDetails: [{ name: 'g1', isLocked: true }, { name: 'g2', isLocked: true }, { name: 'g3', isLocked: false }] },
      { id: 'sm4', authorId: '9001', tagDetails: locked('g1', 'g2', 'g3') }, // 許可投稿者
      { id: 'sm9002', authorId: '2004', tagDetails: locked('g1', 'g2', 'g3') }, // 許可動画
      { id: 'sm5', authorId: null, tagDetails: locked('g2', 'g3', 'g4') },
    ]
    expect(lockTagRuleHits(videos, config)).toEqual(['sm1', 'sm5'])
  })

  it('設定が無い・無効・タグ群が無いときは何も返さない', () => {
    const videos = [{ id: 'sm1', authorId: '2001', tagDetails: locked('g1', 'g2', 'g3') }]
    expect(lockTagRuleHits(videos, null)).toEqual([])
    expect(lockTagRuleHits(videos, { ...config, enabled: false })).toEqual([])
    expect(lockTagRuleHits(videos, { ...config, tagGroups: [] })).toEqual([])
  })
})

describe('normalizeLqngConfig / normalizeLqngVerdicts', () => {
  it('壊れた入力を既定値で補い、重複や空文字を除く', () => {
    const c = normalizeLqngConfig({ enabled: true, titleNeedles: ['a', ' a ', '', 3], tagGroups: [['x', 'x'], [], 'bad'], freq: { dayCount: 0 }, followerMax: -1, allowlist: { authorIds: ['1', '1'], notes: { '1': 'memo', '2': 5 } } })
    expect(c.enabled).toBe(true)
    expect(c.titleNeedles).toEqual(['a'])
    expect(c.tagGroups).toEqual([['x']])
    expect(c.freq.dayCount).toBe(1)
    expect(c.followerMax).toBe(DEFAULT_LQNG_CONFIG.followerMax)
    expect(c.allowlist).toEqual({ authorIds: ['1'], videoIds: [], notes: { '1': 'memo' } })
    expect(normalizeLqngConfig(null).enabled).toBe(false)
    expect(normalizeLqngConfig('x').tagGroups).toEqual([])
  })

  it('判定テーブルの形が壊れていれば空を返す', () => {
    expect(normalizeLqngVerdicts({ authors: {}, videos: {}, updatedAt: 'x' }).updatedAt).toBe('x')
    expect(normalizeLqngVerdicts({ authors: [] }).authors).toEqual({})
    expect(normalizeLqngVerdicts(undefined).videos).toEqual({})
  })

  it('KV キーは lqng: 接頭辞', () => {
    expect(Object.values(LQNG_KV_KEYS).every((k) => k.startsWith('lqng:'))).toBe(true)
  })
})
