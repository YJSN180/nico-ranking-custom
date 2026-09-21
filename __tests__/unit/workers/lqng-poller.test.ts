import { describe, it, expect, vi } from 'vitest'
import { runPoll, LIMITS } from '@/workers/lqng-poller/src/poll'
import { AccessLimitedError, type PollDeps, type SourceVideo, type ThumbResult, type UserInfo } from '@/workers/lqng-poller/src/sources'
import type { KvLike } from '@/workers/lqng-poller/src/state'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import type { LqngConfig, LqngVerdicts } from '@/lib/lqng/types'
import type { LqngEvents, LqngTracking } from '@/workers/lqng-poller/src/state'

// 合成データのみ。実在の ID・名前・タグは使わない

function memoryKv(initial: Record<string, unknown> = {}) {
  const store = new Map<string, string>()
  for (const [k, v] of Object.entries(initial)) store.set(k, JSON.stringify(v))
  const puts: string[] = []
  const kv: KvLike = {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value)
      puts.push(key)
    },
    delete: async (key) => {
      store.delete(key)
    },
  }
  const read = <T,>(key: string): T | null => {
    const raw = store.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  }
  return { kv, puts, read, store }
}

const config: Partial<LqngConfig> = {
  enabled: true,
  pollTags: ['tagA', 'tagB'],
  sweepGenre: 'genreX',
  titleNeedles: ['てすとまん'],
  keywordNeedles: ['ほもと見る'],
  tagGroups: [['g1'], ['g2'], ['g3'], ['g4']],
  lockGroupsMin: 3,
  freq: { dayCount: 5, burstCount: 3, burstMinutes: 30 },
  followerMax: 10,
  holdHours: 6,
  trackDays: 7,
  deletionWindowDays: 7,
  allowlist: { authorIds: ['9001'], videoIds: [] },
}

const T0 = new Date('2026-02-01T12:00:00+09:00')
const at = (min: number): string => new Date(T0.getTime() + min * 60_000).toISOString()

const video = (over: Partial<SourceVideo>): SourceVideo => ({ id: 'sm1', title: '通常', authorId: '1001', registeredAt: at(-1), ownerVisibility: 'visible', ...over })
const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))
const okThumb = (tags = locked('x')): ThumbResult => ({ ok: true, info: { tagDetails: tags, ownerVisibility: 'visible', nickname: 'n' } })
const existing = (followerCount: number): UserInfo => ({ status: 'existing', followerCount, nickname: 'n' })

function deps(over: Partial<PollDeps> = {}, now: Date = T0): PollDeps {
  return {
    now: () => now,
    fetchNewVideos: vi.fn(async () => []),
    fetchThumbInfo: vi.fn(async () => okThumb()),
    fetchUserInfo: vi.fn(async () => existing(100)),
    fetchSweepVideos: vi.fn(async () => []),
    ...over,
  }
}

describe('lqng-poller runPoll', () => {
  it('設定が無効なら何も書かずに終了する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: { ...config, enabled: false } })
    const r = await runPoll(m.kv, deps(), 'poll')
    expect(r.skipped).toBe('disabled')
    expect(m.puts).toEqual([]) // ロックも含めて一切書かない（KV 書き込み枠を消費しない）
    expect(m.store.has(LQNG_KV_KEYS.lock)).toBe(false)
  })

  it('ロックが残っていればスキップする', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    m.store.set(LQNG_KV_KEYS.lock, 'busy')
    const r = await runPoll(m.kv, deps(), 'poll')
    expect(r.skipped).toBe('locked')
  })

  it('タイトル照合語に当たる新着は補完前に動画 NG ＋ 投稿者 NG になる', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({ fetchNewVideos: vi.fn(async () => [video({ id: 'sm1', title: 'て/す/と/ま/ん 新作' })]) })
    const r = await runPoll(m.kv, d, 'poll')
    expect(r.newVideos).toBe(1)
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.videos.sm1?.status).toBe('ng')
    expect(verdicts.videos.sm1?.reasons).toEqual(['B'])
    expect(verdicts.authors['1001']?.status).toBe('ng')
    expect(verdicts.authors['1001']?.evidence[0]?.videoId).toBe('sm1')
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.map((e) => e.kind)).toEqual(expect.arrayContaining(['video_ng', 'author_ng', 'poll']))
    expect(events.lastRun?.newVideos).toBe(1)
    // 書き込みは tracking / verdicts / events の 3 キー（＋ロック）
    expect(r.kvWrites).toBe(3)
  })

  it('ロックタグ群は補完後に判定され、フォロワーが多い現存投稿者は昇格しない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({
      fetchNewVideos: vi.fn(async () => [video({ id: 'sm2' })]),
      fetchThumbInfo: vi.fn(async () => okThumb(locked('g1', 'g2', 'g3'))),
      fetchUserInfo: vi.fn(async () => existing(500)),
    })
    await runPoll(m.kv, d, 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.videos.sm2?.reasons).toEqual(['D'])
    expect(verdicts.authors['1001']).toBeUndefined()
  })

  it('フォロワー 10 人以下ならロックタグ群で投稿者に昇格する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({
      fetchNewVideos: vi.fn(async () => [video({ id: 'sm2' })]),
      fetchThumbInfo: vi.fn(async () => okThumb(locked('g1', 'g2', 'g3'))),
      fetchUserInfo: vi.fn(async () => existing(3)),
    })
    await runPoll(m.kv, d, 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['1001']?.reasons).toEqual(['D'])
    expect(verdicts.authors['1001']?.followerCount).toBe(3)
  })

  it('非公開投稿者の新着は保留になり、期限後に解放される', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d1 = deps({
      fetchNewVideos: vi.fn(async () => [video({ id: 'sm3', ownerVisibility: 'hidden' })]),
      fetchThumbInfo: vi.fn(async (): Promise<ThumbResult> => ({ ok: true, info: { tagDetails: [], ownerVisibility: 'hidden', nickname: null } })),
      fetchUserInfo: vi.fn(async () => existing(100)),
    })
    await runPoll(m.kv, d1, 'poll')
    let verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.videos.sm3?.status).toBe('hold')
    expect(verdicts.videos.sm3?.holdSignals).toEqual(['hidden_owner'])

    // 7 時間後の実行で期限切れ → released
    const later = new Date(T0.getTime() + 7 * 3600_000)
    await runPoll(m.kv, deps({}, later), 'poll')
    verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.videos.sm3?.status).toBe('released')
  })

  it('連投した投稿者が削除されると A∧C で投稿者 NG になる', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const burst = [video({ id: 'sm10', registeredAt: at(-3) }), video({ id: 'sm11', registeredAt: at(-2) }), video({ id: 'sm12', registeredAt: at(-1) })]
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => burst), fetchUserInfo: vi.fn(async () => existing(0)) }), 'poll')
    let verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['1001']).toBeUndefined() // C 単独では NG にしない

    const later = new Date(T0.getTime() + 7 * 3600_000)
    const deleted: UserInfo = { status: 'deleted', followerCount: null, nickname: null }
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => deleted) }, later), 'poll')
    verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['1001']?.reasons).toEqual(['A_C'])
    expect(verdicts.authors['1001']?.deletedObservedAt).toBe(later.toISOString())
  })

  it('1〜2 本で退会した投稿者は A∧C に当たらない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => [video({ id: 'sm20' })]) }), 'poll')
    const later = new Date(T0.getTime() + 7 * 3600_000)
    const deleted: UserInfo = { status: 'deleted', followerCount: null, nickname: null }
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => deleted) }, later), 'poll')
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!.authors['1001']).toBeUndefined()
  })

  it('許可リストの投稿者は判定テーブルに載らない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({
      fetchNewVideos: vi.fn(async () => [video({ id: 'sm30', authorId: '9001', title: 'てすとまん' })]),
      fetchThumbInfo: vi.fn(async () => okThumb(locked('g1', 'g2', 'g3'))),
    })
    await runPoll(m.kv, d, 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)
    expect(verdicts?.authors['9001']).toBeUndefined()
    expect(verdicts?.videos.sm30).toBeUndefined()
  })

  it('補完は 1 回あたりの上限で打ち切り、残りは持ち越す（外部呼び出しは予算内）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const many = Array.from({ length: 60 }, (_, i) => video({ id: `sm${100 + i}`, authorId: String(2000 + i) }))
    const thumb = vi.fn(async () => okThumb())
    const user = vi.fn(async () => existing(100))
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => many), fetchThumbInfo: thumb, fetchUserInfo: user }), 'poll')
    expect(thumb).toHaveBeenCalledTimes(LIMITS.thumbPerRun)
    expect(user.mock.calls.length).toBeLessThanOrEqual(LIMITS.usersPerRun)
    expect(r.subrequests).toBeLessThanOrEqual(LIMITS.subrequestBudget)
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.pending).toHaveLength(60 - LIMITS.thumbPerRun)
  })

  it('getthumbinfo が 403 なら即中断し、未処理分を持ち越して記録する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const thumb = vi.fn(async () => {
      throw new AccessLimitedError('getthumbinfo')
    })
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => [video({ id: 'sm40' }), video({ id: 'sm41', authorId: '1002' })]), fetchThumbInfo: thumb }), 'poll')
    expect(thumb).toHaveBeenCalledTimes(1)
    expect(r.note).toContain('access limited')
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.pending.map((p) => p.id)).toEqual(['sm40', 'sm41'])
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)!.items.some((e) => e.kind === 'access_limited')).toBe(true)
  })

  it('スイープは前日分にタイトルルールだけを掛け、同じ日は二度走らない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const sweep = vi.fn(async () => [video({ id: 'sm50', title: 'テ ス ト マ ン', authorId: '3001', registeredAt: at(-24 * 60) }), video({ id: 'sm51', title: '無関係', authorId: '3002' })])
    const r1 = await runPoll(m.kv, deps({ fetchSweepVideos: sweep }), 'sweep')
    expect(r1.newVideos).toBe(2)
    expect(sweep).toHaveBeenCalledWith('genreX', '2026-01-31')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.videos.sm50?.reasons).toEqual(['B'])
    expect(verdicts.authors['3001']?.status).toBe('ng')
    expect(verdicts.videos.sm51).toBeUndefined()
    const r2 = await runPoll(m.kv, deps({ fetchSweepVideos: sweep }), 'sweep')
    expect(r2.skipped).toBe('already_swept')
  })

  it('同じ動画は二度取り込まず、差分の since は前回実行の 10 分前になる', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const fetchNew = vi.fn(async () => [video({ id: 'sm60' })])
    await runPoll(m.kv, deps({ fetchNewVideos: fetchNew }), 'poll')
    const later = new Date(T0.getTime() + 15 * 60_000)
    const r = await runPoll(m.kv, deps({ fetchNewVideos: fetchNew }, later), 'poll')
    expect(r.newVideos).toBe(0)
    const since = (fetchNew.mock.calls[1] as unknown as [string[], string])[1]
    expect(since).toBe(new Date(T0.getTime() - LIMITS.sinceOverlapMinutes * 60_000).toISOString())
  })
})
