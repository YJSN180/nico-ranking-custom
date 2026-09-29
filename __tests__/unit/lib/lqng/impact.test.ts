import { describe, it, expect } from 'vitest'
import { evaluateLqngImpact, lqngImpactKey, LQNG_IMPACT_EXAMPLES } from '@/lib/lqng/impact'
import { DEFAULT_LQNG_CONFIG, type LqngConfig } from '@/lib/lqng/types'
import type { RankingItem } from '@/types/ranking'

// 合成データのみ。実在のタイトル・タグ・ID は使わない
const config: LqngConfig = {
  ...DEFAULT_LQNG_CONFIG,
  enabled: true,
  titleNeedles: ['てすとまん'],
  keywordNeedles: ['ほもと見る'],
  tagGroups: [['g1'], ['g2'], ['g3'], ['g4']],
  lockGroupsMin: 3,
  allowlist: { authorIds: ['9001'], videoIds: ['sm9002'] },
}

const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))
const item = (id: string, over: Partial<RankingItem> = {}): RankingItem => ({ rank: 1, id, title: `通常の動画 ${id}`, thumbURL: '', views: 0, authorId: `a-${id}`, ...over })

describe('evaluateLqngImpact', () => {
  it('リクエスト時ルール（B・D）で非表示になる本数と、規則ごとの本数・例を返す', () => {
    const items = [
      item('sm1', { title: 'て/す/と/ま/ん 新作' }),
      item('sm2', { tagDetails: locked('g1', 'g2', 'g3') }),
      item('sm3', { title: 'てすとまん', tagDetails: locked('g1', 'g2', 'g4') }), // B と D の両方
      item('sm4', { title: 'ほもと見るだけ' }), // キーワードだけ（単独では非表示にならない）
      item('sm5'),
    ]
    const impact = evaluateLqngImpact(items, config)
    expect(impact.evaluated).toBe(5)
    expect(impact.hidden).toBe(3)
    expect(impact.rules).toEqual([
      { rule: 'B', count: 2, examples: [{ id: 'sm1', title: 'て/す/と/ま/ん 新作' }, { id: 'sm3', title: 'てすとまん' }] },
      { rule: 'D', count: 2, examples: [{ id: 'sm2', title: '通常の動画 sm2' }, { id: 'sm3', title: 'てすとまん' }] },
      { rule: 'HK', count: 1, examples: [{ id: 'sm4', title: 'ほもと見るだけ' }] },
    ])
  })

  it('同じ動画（24 時間と毎時の両方に載る）は 1 本に数え、例は規則ごとに上限まで', () => {
    const many = Array.from({ length: LQNG_IMPACT_EXAMPLES + 3 }, (_, i) => item(`sm${100 + i}`, { title: `てすとまん ${i}` }))
    const impact = evaluateLqngImpact([...many, ...many], config)
    expect(impact.evaluated).toBe(many.length)
    expect(impact.hidden).toBe(many.length)
    const b = impact.rules.find((r) => r.rule === 'B')!
    expect(b.count).toBe(many.length)
    expect(b.examples).toHaveLength(LQNG_IMPACT_EXAMPLES)
  })

  it('許可リストの動画・投稿者は数えない', () => {
    const impact = evaluateLqngImpact([item('sm9002', { title: 'てすとまん' }), item('sm7', { title: 'ほもと見る', authorId: '9001' }), item('sm8', { title: 'てすとまん', authorId: '9001' })], config)
    expect(impact.hidden).toBe(0)
    expect(impact.rules.every((r) => r.count === 0 && r.examples.length === 0)).toBe(true)
  })

  it('無効な設定では何も一致しない（非表示にならない）', () => {
    const impact = evaluateLqngImpact([item('sm1', { title: 'てすとまん' }), item('sm2', { title: 'ほもと見る' })], { ...config, enabled: false })
    expect(impact.evaluated).toBe(2)
    expect(impact.hidden).toBe(0)
    expect(impact.rules.map((r) => r.count)).toEqual([0, 0, 0])
  })
})

describe('lqngImpactKey', () => {
  it('ランキングへの影響に関わる項目（有効・照合語・キーワード・タグ群・閾値）だけで変わる', () => {
    const base = lqngImpactKey(config)
    expect(lqngImpactKey({ ...config, holdHours: 12, followerMax: 3, pollTags: ['x'] })).toBe(base)
    expect(lqngImpactKey({ ...config, titleNeedles: ['べつのご'] })).not.toBe(base)
    expect(lqngImpactKey({ ...config, keywordNeedles: [] })).not.toBe(base)
    expect(lqngImpactKey({ ...config, tagGroups: [['g1']] })).not.toBe(base)
    expect(lqngImpactKey({ ...config, lockGroupsMin: 2 })).not.toBe(base)
    expect(lqngImpactKey({ ...config, enabled: false })).not.toBe(base)
  })
})
