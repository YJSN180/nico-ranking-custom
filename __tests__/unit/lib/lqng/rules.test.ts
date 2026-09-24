import { describe, it, expect } from 'vitest'
import { countLockedGroups, decideHold, evaluateDeletion, evaluateVideo, isFrequent } from '@/lib/lqng/rules'
import { DEFAULT_LQNG_CONFIG, type AuthorObservation, type LqngConfig, type VideoObservation } from '@/lib/lqng/types'

// 合成データのみ。実在のタグ名・ID・名前は使わない
const config: LqngConfig = {
  ...DEFAULT_LQNG_CONFIG,
  enabled: true,
  titleNeedles: ['てすとまん'],
  keywordNeedles: ['ほもと見る'],
  tagGroups: [['g1'], ['g2'], ['g3a', 'g3b'], ['g4'], ['g5'], ['g6']],
  lockGroupsMin: 3,
  freq: { dayCount: 5, burstCount: 3, burstMinutes: 30 },
  followerMax: 10,
  holdHours: 6,
  trackDays: 7,
  deletionWindowDays: 7,
  allowlist: { authorIds: ['9001'], videoIds: ['sm9002'] },
}

const T0 = Date.parse('2026-01-10T12:00:00+09:00')
const iso = (offsetMin: number): string => new Date(T0 + offsetMin * 60_000).toISOString()

const video = (over: Partial<VideoObservation> = {}): VideoObservation => ({
  id: 'sm1',
  title: '通常のタイトル',
  authorId: '1001',
  registeredAt: iso(0),
  tagDetails: null,
  ownerVisibility: 'visible',
  ...over,
})

const author = (over: Partial<AuthorObservation> = {}): AuthorObservation => ({
  authorId: '1001',
  status: 'existing',
  followerCount: 100,
  visibility: 'visible',
  posts: [],
  deletedObservedAt: null,
  ...over,
})

/** 投稿（分オフセット → 別々の動画 ID）。ID は並び順から合成する */
const posts = (...offsetsMin: number[]) => offsetsMin.map((m, i) => ({ id: `sm${7000 + i}`, at: iso(m) }))

const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))
const unlocked = (...names: string[]) => names.map((name) => ({ name, isLocked: false }))

describe('countLockedGroups', () => {
  it('グループ内は OR、グループ間は個数で数える', () => {
    expect(countLockedGroups(locked('g1', 'g2', 'g3b'), config.tagGroups)).toBe(3)
    expect(countLockedGroups([...locked('g1'), ...unlocked('g2', 'g3a')], config.tagGroups)).toBe(1)
    expect(countLockedGroups(locked('g3a', 'g3b'), config.tagGroups)).toBe(1)
    expect(countLockedGroups(null, config.tagGroups)).toBe(0)
    expect(countLockedGroups(locked('g1'), [])).toBe(0)
  })
})

describe('isFrequent', () => {
  it('24 時間に 5 本以上、または 30 分に 3 本以上で該当', () => {
    expect(isFrequent(posts(0, 60, 120, 180), config.freq)).toBe(false) // 1 時間おきに 4 本
    expect(isFrequent(posts(0, 1, 2), config.freq)).toBe(true) // 3 分間に 3 本は連投
    expect(isFrequent(posts(0, 300, 600, 900, 1200), config.freq)).toBe(true) // 20 時間に 5 本
    expect(isFrequent(posts(0, 400, 800, 1200, 1500), config.freq)).toBe(false) // 25 時間に 5 本
    expect(isFrequent(posts(0, 10, 29), config.freq)).toBe(true) // 29 分に 3 本
    expect(isFrequent(posts(0, 10, 31), config.freq)).toBe(false)
  })

  it('同じ秒に公開された別々の動画 3 本は連投として数える', () => {
    expect(isFrequent(posts(0, 0, 0), config.freq)).toBe(true)
  })

  it('同じ動画が 2 回渡されても 1 本として数える', () => {
    const one = { id: 'sm8000', at: iso(0) }
    expect(isFrequent([one, one, { id: 'sm8001', at: iso(1) }], config.freq)).toBe(false)
    expect(isFrequent([one, { id: 'sm8000', at: iso(5) }, { id: 'sm8001', at: iso(1) }], config.freq)).toBe(false)
  })
})

describe('evaluateVideo', () => {
  it('B: 分断表記のタイトルでも動画 NG かつ投稿者昇格（フォロワー条件なし）', () => {
    const r = evaluateVideo(video({ title: 'て/す/と/ま/んが限界突破' }), author({ followerCount: 5000 }), config)
    expect(r.ng).toBe(true)
    expect(r.reasons).toEqual(['B'])
    expect(r.escalate).toBe(true)
    expect(r.escalateReasons).toEqual(['B'])
  })

  it('D: ロック群 3 つ以上で動画 NG。現存投稿者の昇格はフォロワー ≤ 10 のときだけ', () => {
    const v = video({ tagDetails: locked('g1', 'g2', 'g4') })
    const rich = evaluateVideo(v, author({ followerCount: 256 }), config)
    expect(rich.ng).toBe(true)
    expect(rich.reasons).toEqual(['D'])
    expect(rich.escalate).toBe(false)

    const poor = evaluateVideo(v, author({ followerCount: 10 }), config)
    expect(poor.escalate).toBe(true)
    expect(poor.escalateReasons).toEqual(['D'])

    const unknownFollowers = evaluateVideo(v, author({ followerCount: null }), config)
    expect(unknownFollowers.escalate).toBe(false)

    // 未確認の投稿者（ユーザー情報 API をまだ叩いていない）は判断を保留する
    const unchecked = evaluateVideo(v, author({ status: 'unknown', followerCount: null }), config)
    expect(unchecked.ng).toBe(true)
    expect(unchecked.escalate).toBe(false)
    expect(evaluateVideo(v, null, config).escalate).toBe(false)
  })

  it('D: 削除済み投稿者はフォロワー数が取れないため無条件に昇格', () => {
    const r = evaluateVideo(video({ tagDetails: locked('g1', 'g2', 'g4') }), author({ status: 'deleted', followerCount: null }), config)
    expect(r.escalate).toBe(true)
  })

  it('D: ロック群 2 つでは非該当', () => {
    const r = evaluateVideo(video({ tagDetails: [...locked('g1', 'g2'), ...unlocked('g4', 'g5')] }), author(), config)
    expect(r.ng).toBe(false)
    expect(r.lockedGroups).toBe(2)
  })

  it('C∧D: 投稿頻度 ∧ D で昇格（フォロワー条件なし）', () => {
    const r = evaluateVideo(
      video({ tagDetails: locked('g1', 'g2', 'g4') }),
      author({ followerCount: 5000, posts: posts(-5, -10) }),
      config
    )
    expect(r.frequent).toBe(true)
    expect(r.reasons).toEqual(['D', 'C_D'])
    expect(r.escalateReasons).toEqual(['C_D'])
  })

  it('HK: キーワード単独では非該当、C または D と組み合わさると該当', () => {
    const alone = evaluateVideo(video({ title: 'ホモと見る何か' }), author(), config)
    expect(alone.ng).toBe(false)

    const withC = evaluateVideo(video({ title: 'ホモと見る何か' }), author({ posts: posts(-5, -10), followerCount: 5000 }), config)
    expect(withC.reasons).toEqual(['HK'])
    expect(withC.escalate).toBe(true)

    const withD = evaluateVideo(video({ title: 'ホモと見る何か', tagDetails: locked('g1', 'g2', 'g5') }), author({ followerCount: 5000 }), config)
    expect(withD.reasons).toEqual(['D', 'HK'])
    expect(withD.escalateReasons).toEqual(['HK'])
  })

  it('同じ秒に公開された別々の動画でも投稿頻度に数え、評価中の動画自身は二重に数えない', () => {
    // 投稿者の追跡に評価中の動画（sm1）も入っている。sm1 を二重に数えると 3 本になってしまう
    const withSelf = author({ posts: [{ id: 'sm1', at: iso(0) }, { id: 'sm7001', at: iso(0) }] })
    expect(evaluateVideo(video({ title: 'ホモと見る何か' }), withSelf, config).frequent).toBe(false)
    const threeAtOnce = author({ posts: [{ id: 'sm7001', at: iso(0) }, { id: 'sm7002', at: iso(0) }] })
    const r = evaluateVideo(video({ title: 'ホモと見る何か' }), threeAtOnce, config)
    expect(r.frequent).toBe(true)
    expect(r.reasons).toEqual(['HK'])
  })

  it('C 単独では NG にしない', () => {
    const r = evaluateVideo(video(), author({ posts: posts(-5, -10, -15, -20) }), config)
    expect(r.frequent).toBe(true)
    expect(r.ng).toBe(false)
  })

  it('許可リストの投稿者・動画は常に非該当', () => {
    expect(evaluateVideo(video({ title: 'てすとまん', authorId: '9001' }), author({ authorId: '9001' }), config).ng).toBe(false)
    expect(evaluateVideo(video({ id: 'sm9002', title: 'てすとまん' }), author(), config).ng).toBe(false)
  })

  it('設定が無効なら何も該当しない', () => {
    const r = evaluateVideo(video({ title: 'てすとまん', tagDetails: locked('g1', 'g2', 'g4') }), author(), { ...config, enabled: false })
    expect(r.ng).toBe(false)
    expect(r.escalate).toBe(false)
  })
})

describe('evaluateDeletion (A∧C)', () => {
  it('投稿から 7 日以内に削除を観測し、投稿頻度に該当すれば投稿者 NG', () => {
    const a = author({ status: 'deleted', followerCount: null, posts: posts(0, 5, 10, 15, 20), deletedObservedAt: iso(2 * 24 * 60) })
    expect(evaluateDeletion(a, config)).toEqual({ ng: true, reason: 'A_C' })
  })

  it('投稿頻度に該当しない削除（1〜2 本で退会）は非該当', () => {
    const a = author({ status: 'deleted', followerCount: null, posts: posts(0, 60), deletedObservedAt: iso(60 * 24) })
    expect(evaluateDeletion(a, config).ng).toBe(false)
  })

  it('最後の投稿から 7 日より後の削除は非該当', () => {
    const a = author({ status: 'deleted', followerCount: null, posts: posts(0, 5, 10, 15, 20), deletedObservedAt: iso(8 * 24 * 60) })
    expect(evaluateDeletion(a, config).ng).toBe(false)
  })

  it('現存投稿者や許可リストは非該当', () => {
    expect(evaluateDeletion(author({ posts: posts(0, 5, 10) }), config).ng).toBe(false)
    const allowed = author({ authorId: '9001', status: 'deleted', posts: posts(0, 5, 10), deletedObservedAt: iso(60) })
    expect(evaluateDeletion(allowed, config).ng).toBe(false)
  })
})

describe('decideHold', () => {
  const now = new Date(T0 + 60 * 60_000) // 投稿から 1 時間後

  it('投稿者が非公開なら holdHours まで保留', () => {
    const r = decideHold(video({ ownerVisibility: 'hidden' }), author({ followerCount: 100 }), config, now)
    expect(r.hold).toBe(true)
    expect(r.signals).toEqual(['hidden_owner'])
    expect(r.until).toBe(new Date(T0 + 6 * 60 * 60_000).toISOString())
  })

  it('フォロワー ≤ 10 の現存投稿者なら保留', () => {
    const r = decideHold(video(), author({ followerCount: 3 }), config, now)
    expect(r.hold).toBe(true)
    expect(r.signals).toEqual(['low_followers'])
  })

  it('信号がない・期限切れ・許可リストは保留しない', () => {
    expect(decideHold(video(), author({ followerCount: 100 }), config, now).hold).toBe(false)
    expect(decideHold(video({ ownerVisibility: 'hidden' }), author(), config, new Date(T0 + 7 * 60 * 60_000)).hold).toBe(false)
    expect(decideHold(video({ authorId: '9001', ownerVisibility: 'hidden' }), author({ authorId: '9001' }), config, now).hold).toBe(false)
  })
})
