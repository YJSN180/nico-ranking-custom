import { describe, it, expect, vi } from 'vitest'
import { runPoll, LIMITS } from '@/workers/lqng-poller/src/poll'
import { commitBackfill } from '@/workers/lqng-poller/src/backfill'
import { AccessLimitedError, type NewVideosResult, type PollDeps, type SourceVideo, type ThumbResult, type UserInfo } from '@/workers/lqng-poller/src/sources'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import type { LqngConfig, LqngVerdicts } from '@/lib/lqng/types'
import type { LqngEvents, LqngTracking } from '@/workers/lqng-poller/src/state'
import { memoryKv } from './helpers/lqng-memory-kv'

// 合成データのみ。実在の ID・名前・タグは使わない

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
/** 主経路（本家タグページ）の取得結果 */
const pages = (videos: SourceVideo[], failures: string[] = []): NewVideosResult => ({ videos, failures })
const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))
const okThumb = (tags = locked('x')): ThumbResult => ({ ok: true, info: { tagDetails: tags, ownerVisibility: 'visible', nickname: 'n' } })
const existing = (followerCount: number): UserInfo => ({ status: 'existing', followerCount, nickname: 'n' })

function deps(over: Partial<PollDeps> = {}, now: Date = T0): PollDeps {
  return {
    now: () => now,
    fetchNewVideos: vi.fn(async () => pages([])),
    fetchThumbInfo: vi.fn(async () => okThumb()),
    fetchUserInfo: vi.fn(async () => existing(100)),
    fetchSweepVideos: vi.fn(async () => []),
    ...over,
  }
}

describe('lqng-poller runPoll', () => {
  it('主経路の新着取得が壊れたら予備（nvapi）で取り込み、履歴に理由を残す', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const primary = vi.fn(async () => {
      throw new Error('server-response meta not found')
    })
    const fallback = vi.fn(async () => [video({ id: 'sm70', authorId: '7001' })])
    const r = await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback }), 'poll')
    expect(r.skipped).toBeNull()
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(r.newVideos).toBe(1)
    expect(r.note).toContain('fallback')
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.some((e) => e.kind === 'error' && e.note?.includes('new_videos_primary_failed'))).toBe(true)
  })

  it('連投中の投稿者は待ち行列が長くても先に存在確認・補完される', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    // 通常の投稿者 12 人（各 1 本、先に観測）と、最後に観測された連投者 1 人（4 本を 6 分以内）
    const normal = Array.from({ length: 12 }, (_, i) => video({ id: `n${i}`, authorId: `${3000 + i}`, registeredAt: at(-60 - i) }))
    const burst = Array.from({ length: 4 }, (_, i) => video({ id: `b${i}`, authorId: '4000', registeredAt: at(-2 - i) }))
    const fetchUserInfo = vi.fn(async (id: string) => (id === '4000' ? ({ status: 'deleted', followerCount: null, nickname: null } as UserInfo) : existing(100)))
    const fetchThumbInfo = vi.fn(async () => okThumb())
    const d = deps({ fetchNewVideos: vi.fn(async () => pages([...normal, ...burst])), fetchUserInfo, fetchThumbInfo })
    const r = await runPoll(m.kv, d, 'poll')
    expect(r.skipped).toBeNull()
    // 存在確認は 1 回 10 人まで。連投者 4000 が先頭に来る
    expect(vi.mocked(fetchUserInfo).mock.calls[0]?.[0]).toBe('4000')
    // 補完も連投者の動画から始まる
    expect(vi.mocked(fetchThumbInfo).mock.calls.slice(0, 4).map((c) => c[0])).toEqual(['b0', 'b1', 'b2', 'b3'])
    // 1 回目の 404 は退会の疑いにとどめる
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.authors['4000']?.deletionSuspectedAt).toBe(T0.toISOString())
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['4000']).toBeUndefined()
    // 1 時間後の確認で、待ち行列より先に確かめて確定し、削除済み ∧ 連投 → 投稿者 NG
    fetchUserInfo.mockClear()
    await runPoll(m.kv, { ...d, now: () => new Date(T0.getTime() + 61 * 60_000) }, 'poll')
    expect(vi.mocked(fetchUserInfo).mock.calls[0]?.[0]).toBe('4000')
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['4000']?.reasons).toEqual(['A_C'])
  })

  it('設定が無効なら何も書かずに終了する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: { ...config, enabled: false } })
    const r = await runPoll(m.kv, deps(), 'poll')
    expect(r.skipped).toBe('disabled')
    expect(m.puts).toEqual([]) // 一切書かない（KV 書き込み枠を消費しない）
    expect(m.deletes).toEqual([])
  })

  it('ロックは使わない（古いロックキーが残っていても実行し、ロックの put / delete をしない）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, 'lqng:lock': 'busy' })
    const r = await runPoll(m.kv, deps(), 'poll')
    expect(r.skipped).toBeNull()
    expect(m.puts).not.toContain('lqng:lock')
    expect(m.deletes).toEqual([])
  })

  it('何も変わらない定常の poll は追跡表だけを 1 回書き、判定表と履歴は書かない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm80', title: 'て/す/と/ま/ん' })])) }), 'poll')
    const verdictsBefore = m.store.get(LQNG_KV_KEYS.verdicts)
    const eventsBefore = m.store.get(LQNG_KV_KEYS.events)
    m.reset()
    const later = new Date(T0.getTime() + 15 * 60_000)
    const r = await runPoll(m.kv, deps({}, later), 'poll')
    expect(r.skipped).toBeNull()
    expect(m.puts).toEqual([LQNG_KV_KEYS.tracking])
    expect(m.deletes).toEqual([])
    expect(r.kvWrites).toBe(1)
    // 判定表は updatedAt も含めて前回のまま、履歴に poll の要約は積まない
    expect(m.store.get(LQNG_KV_KEYS.verdicts)).toBe(verdictsBefore)
    expect(m.store.get(LQNG_KV_KEYS.events)).toBe(eventsBefore)
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.lastRun?.at).toBe(later.toISOString())
    expect(tracking.lastRun?.kvWrites).toBe(1)
    expect(tracking.lastPollAt).toBe(later.toISOString())
    expect(tracking.updatedAt).toBe(later.toISOString())
  })

  it('判定が変わった回は判定表・履歴・追跡表を書き、記録と戻り値の書き込み数が一致する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm81', title: 'て/す/と/ま/ん' })])) }), 'poll')
    expect([...m.puts].sort()).toEqual([LQNG_KV_KEYS.events, LQNG_KV_KEYS.tracking, LQNG_KV_KEYS.verdicts].sort())
    expect(r.kvWrites).toBe(3)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastRun?.kvWrites).toBe(3)
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.updatedAt).toBe(T0.toISOString())
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.some((e) => e.kind === 'poll')).toBe(false)
  })

  it('タイトル照合語に当たる新着は補完前に動画 NG ＋ 投稿者 NG になる', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm1', title: 'て/す/と/ま/ん 新作' })])) })
    const r = await runPoll(m.kv, d, 'poll')
    expect(r.newVideos).toBe(1)
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.videos.sm1?.status).toBe('ng')
    expect(verdicts.videos.sm1?.reasons).toEqual(['B'])
    expect(verdicts.authors['1001']?.status).toBe('ng')
    expect(verdicts.authors['1001']?.evidence[0]?.videoId).toBe('sm1')
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.map((e) => e.kind)).toEqual(expect.arrayContaining(['video_ng', 'author_ng']))
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastRun?.newVideos).toBe(1)
    // 書き込みは tracking / verdicts / events の 3 キー
    expect(r.kvWrites).toBe(3)
  })

  it('ロックタグ群は補完後に判定され、フォロワーが多い現存投稿者は昇格しない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({
      fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm2' })])),
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
      fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm2' })])),
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
      fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm3', ownerVisibility: 'hidden' })])),
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
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(burst)), fetchUserInfo: vi.fn(async () => existing(0)) }), 'poll')
    let verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['1001']).toBeUndefined() // C 単独では NG にしない

    const later = new Date(T0.getTime() + 7 * 3600_000)
    const deleted: UserInfo = { status: 'deleted', followerCount: null, nickname: null }
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => deleted) }, later), 'poll')
    // 1 回目の 404 は疑いだけ（まだ NG にしない）
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
    const confirmAt = new Date(later.getTime() + 60 * 60_000)
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => deleted) }, confirmAt), 'poll')
    verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['1001']?.reasons).toEqual(['A_C'])
    // 削除の観測時刻は最初に 404 を見た時刻
    expect(verdicts.authors['1001']?.deletedObservedAt).toBe(later.toISOString())
  })

  it('同じ秒に公開された別々の動画 3 本は連投として扱う（キーワード ∧ 連投 = HK）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const sameSecond = ['sm97', 'sm98', 'sm99'].map((id) => video({ id, title: 'ほもと見る何か', registeredAt: at(-1) }))
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(sameSecond)) }), 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['1001']?.reasons).toContain('HK')
  })

  it('1〜2 本で退会した投稿者は A∧C に当たらない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm20' })])) }), 'poll')
    const later = new Date(T0.getTime() + 7 * 3600_000)
    const deleted: UserInfo = { status: 'deleted', followerCount: null, nickname: null }
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => deleted) }, later), 'poll')
    // 判定が変わらなければ判定表は書かれない
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
  })

  it('許可リストの投稿者は判定テーブルに載らない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({
      fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm30', authorId: '9001', title: 'てすとまん' })])),
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
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(many)), fetchThumbInfo: thumb, fetchUserInfo: user }), 'poll')
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
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm40' }), video({ id: 'sm41', authorId: '1002' })])), fetchThumbInfo: thumb }), 'poll')
    expect(thumb).toHaveBeenCalledTimes(1)
    expect(r.note).toContain('access limited')
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.pending.map((p) => p.id)).toEqual(['sm40', 'sm41'])
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)!.items.some((e) => e.kind === 'access_limited')).toBe(true)
  })

  it('スイープは前日分を取り込んで判定し、同じ日は二度走らない', async () => {
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

  it('同じ動画は二度取り込まず、差分の since は前回実行から重なり分（6 時間）前になる', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const fetchNew = vi.fn(async () => pages([video({ id: 'sm60' })]))
    await runPoll(m.kv, deps({ fetchNewVideos: fetchNew }), 'poll')
    const later = new Date(T0.getTime() + 15 * 60_000)
    const r = await runPoll(m.kv, deps({ fetchNewVideos: fetchNew }, later), 'poll')
    expect(r.newVideos).toBe(0)
    const since = (fetchNew.mock.calls[1] as unknown as [string[], string])[1]
    expect(since).toBe(new Date(T0.getTime() - LIMITS.sinceOverlapMinutes * 60_000).toISOString())
  })
})

describe('lqng-poller 受け箱（バックフィルの確定）の合流', () => {
  const inboxItem = (seq: number, deltas: unknown) => ({ version: 1, runId: 'run1', seq, at: '2026-01-31T00:00:00.000Z', deltas })
  const authorVerdict = (reasons: string[], videoId = 'sm700') => ({
    status: 'ng',
    reasons,
    since: '2026-01-31T00:00:00.000Z',
    evidence: [{ videoId, title: 't', registeredAt: '2026-01-30T00:00:00.000Z', rules: reasons }],
    nickname: null,
    followerCount: null,
    visibility: null,
    deletedObservedAt: null,
  })
  const videoVerdict = (authorId: string | null) => ({ status: 'ng', reasons: ['D'], authorId, title: 't', registeredAt: '2026-01-30T00:00:00.000Z', since: '2026-01-31T00:00:00.000Z' })

  it('受け箱の差分を判定表へ合流し、合流したキーを消して履歴に件数を残す', async () => {
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: config,
      'lqng:inbox:run1:000001': inboxItem(1, { authors: { '7001': authorVerdict(['A_C']) }, videos: { sm701: videoVerdict('7002') } }),
      'lqng:inbox:run1:000002': inboxItem(2, { authors: { '7003': authorVerdict(['B']) }, videos: {} }),
    })
    const r = await runPoll(m.kv, deps(), 'poll')
    expect(r.skipped).toBeNull()
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['7001']?.reasons).toEqual(['A_C'])
    expect(verdicts.authors['7001']?.since).toBe(T0.toISOString())
    expect(verdicts.authors['7003']?.reasons).toEqual(['B'])
    expect(verdicts.videos.sm701?.status).toBe('ng')
    expect(Array.from(m.store.keys()).filter((k) => k.startsWith('lqng:inbox:'))).toEqual([])
    expect(m.deletes.sort()).toEqual(['lqng:inbox:run1:000001', 'lqng:inbox:run1:000002'])
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.find((e) => e.kind === 'backfill')?.note).toBe('投稿者 +2 / 動画 +1')
    // 書き込み数には受け箱の削除も含める（判定表・履歴・追跡表 + 削除 2）
    expect(r.kvWrites).toBe(5)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastRun?.kvWrites).toBe(5)
  })

  it('commitBackfill が置いた差分を次のポーリングが合流する（確定は判定表を書かない）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const c = await commitBackfill(m.kv, T0, { authors: { '7051': authorVerdict(['A_C']) }, videos: { sm751: videoVerdict('7052') } }, { runId: 'gh-9-1', seq: 1 })
    expect(c.kvWrites).toBe(1)
    expect(m.store.has(LQNG_KV_KEYS.verdicts)).toBe(false)
    await runPoll(m.kv, deps(), 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['7051']?.reasons).toEqual(['A_C'])
    expect(verdicts.videos.sm751?.reasons).toEqual(['D'])
    expect(m.store.has('lqng:inbox:gh-9-1:000001')).toBe(false)
  })

  it('同じ差分を 2 回合流しても判定表は変わらない（2 回目は判定表を書かない）', async () => {
    const deltas = { authors: { '7101': authorVerdict(['A_C']) }, videos: { sm711: videoVerdict('7102') } }
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, 'lqng:inbox:run1:000001': inboxItem(1, deltas) })
    await runPoll(m.kv, deps(), 'poll')
    const first = m.store.get(LQNG_KV_KEYS.verdicts)
    // 同じ内容がもう一度届く（再送・削除前の停止など）
    m.store.set('lqng:inbox:run1:000002', JSON.stringify(inboxItem(2, deltas)))
    m.reset()
    const later = new Date(T0.getTime() + 15 * 60_000)
    await runPoll(m.kv, deps({}, later), 'poll')
    expect(m.store.get(LQNG_KV_KEYS.verdicts)).toBe(first)
    expect(m.puts).not.toContain(LQNG_KV_KEYS.verdicts)
    expect(m.deletes).toEqual(['lqng:inbox:run1:000002'])
  })

  it('既に NG の投稿者へ理由を足す差分も反映する（根拠も重複なく足す）', async () => {
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: config,
      [LQNG_KV_KEYS.verdicts]: { version: 1, authors: { '7201': authorVerdict(['B'], 'sm720') }, videos: {}, updatedAt: '2026-01-31T00:00:00.000Z' },
      'lqng:inbox:run1:000001': inboxItem(1, { authors: { '7201': authorVerdict(['A_C'], 'sm721') }, videos: {} }),
    })
    await runPoll(m.kv, deps(), 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.authors['7201']?.reasons).toEqual(['B', 'A_C'])
    expect(verdicts.authors['7201']?.since).toBe('2026-01-31T00:00:00.000Z')
    expect(verdicts.authors['7201']?.evidence.map((e) => e.videoId)).toEqual(['sm720', 'sm721'])
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.find((e) => e.kind === 'backfill')?.note).toBe('投稿者 +0 / 動画 +0 / 理由追加 1')
  })

  it('許可リストの投稿者・動画と、投稿者 NG の動画は合流しない', async () => {
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: { ...config, allowlist: { authorIds: ['9001'], videoIds: ['sm732'] } },
      'lqng:inbox:run1:000001': inboxItem(1, {
        authors: { '9001': authorVerdict(['A_C']), '7301': authorVerdict(['B']) },
        videos: { sm731: videoVerdict('9001'), sm732: videoVerdict('7302'), sm733: videoVerdict('7301') },
      }),
    })
    await runPoll(m.kv, deps(), 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(Object.keys(verdicts.authors)).toEqual(['7301'])
    expect(verdicts.videos).toEqual({})
  })

  it('壊れた受け箱は消して、履歴に記録する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    m.store.set('lqng:inbox:run1:000001', '{not json')
    await runPoll(m.kv, deps(), 'poll')
    expect(m.store.has('lqng:inbox:run1:000001')).toBe(false)
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'error' && e.note === 'inbox_invalid: 1')).toBe(true)
  })

  it('1 回に合流する受け箱は上限件数まで（残りは次回）', async () => {
    const initial: Record<string, unknown> = { [LQNG_KV_KEYS.config]: config }
    for (let i = 1; i <= LIMITS.inboxPerRun + 2; i++) initial[`lqng:inbox:run1:${String(i).padStart(6, '0')}`] = inboxItem(i, { authors: { [String(7400 + i)]: authorVerdict(['B']) }, videos: {} })
    const m = memoryKv(initial)
    await runPoll(m.kv, deps(), 'poll')
    expect(m.deletes).toHaveLength(LIMITS.inboxPerRun)
    expect(Array.from(m.store.keys()).filter((k) => k.startsWith('lqng:inbox:'))).toHaveLength(2)
  })
})

describe('lqng-poller 新着取得の失敗と最終取得時刻', () => {
  const later = new Date(T0.getTime() + 15 * 60_000)

  async function afterFirstPoll() {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    await runPoll(m.kv, deps(), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(T0.toISOString())
    return m
  }

  it('主経路がアクセス制限なら最終取得時刻を進めず、次回は前回の時刻から重なり分を取り直す', async () => {
    const m = await afterFirstPoll()
    const limited = vi.fn(async () => {
      throw new AccessLimitedError('nico-page')
    })
    const r = await runPoll(m.kv, deps({ fetchNewVideos: limited }, later), 'poll')
    expect(r.skipped).toBeNull()
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(T0.toISOString())
    const next = vi.fn(async () => pages([]))
    await runPoll(m.kv, deps({ fetchNewVideos: next }, new Date(later.getTime() + 15 * 60_000)), 'poll')
    const since = (next.mock.calls[0] as unknown as [string[], string])[1]
    expect(since).toBe(new Date(T0.getTime() - LIMITS.sinceOverlapMinutes * 60_000).toISOString())
  })

  it('主経路が壊れて予備もアクセス制限なら最終取得時刻を進めない', async () => {
    const m = await afterFirstPoll()
    const primary = vi.fn(async () => {
      throw new Error('server-response meta not found')
    })
    const fallback = vi.fn(async () => {
      throw new AccessLimitedError('nvapi')
    })
    await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback }, later), 'poll')
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(T0.toISOString())
  })

  it('主経路も予備も壊れていれば、記録して他の処理は続け、最終取得時刻は進めない', async () => {
    const m = await afterFirstPoll()
    const primary = vi.fn(async () => {
      throw new Error('nico_page_http_500')
    })
    const fallback = vi.fn(async () => {
      throw new Error('nvapi_http_503')
    })
    const reportError = vi.fn()
    // 補完待ちが 1 件あり、新着取得が失敗してもこの回で補完される
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    tracking.authors['1001'] = { authorId: '1001', firstSeenAt: T0.toISOString(), lastPostAt: at(-1), posts: [{ id: 'sm90', title: '通常', at: at(-1), tagDetails: null, ownerVisibility: 'visible' }], status: 'unknown', lastCheckedAt: null, followerCount: null, nickname: null, visibility: null, deletedObservedAt: null }
    tracking.pending = [{ id: 'sm90', authorId: '1001', attempts: 0 }]
    m.store.set(LQNG_KV_KEYS.tracking, JSON.stringify(tracking))
    const thumb = vi.fn(async () => okThumb())
    const r = await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback, fetchThumbInfo: thumb, reportError }, later), 'poll')
    expect(r.skipped).toBeNull()
    expect(thumb).toHaveBeenCalledWith('sm90')
    const saved = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(saved.lastPollAt).toBe(T0.toISOString())
    expect(saved.pending).toEqual([])
    expect(saved.lastRun?.note).toContain('new_videos_failed')
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.some((e) => e.kind === 'error' && e.note?.includes('nvapi_http_503'))).toBe(true)
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('主経路の一部（ショートなど）だけ失敗しても予備には縮退せず、取れた分を取り込んで注記する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const primary = vi.fn(async () => pages([video({ id: 'sm92' })], ['t0:tag_shorts:p1 nico_page_http_503']))
    const fallback = vi.fn(async () => [video({ id: 'sm93' })])
    const r = await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback }), 'poll')
    expect(fallback).not.toHaveBeenCalled()
    expect(r.newVideos).toBe(1)
    expect(r.note).toContain('new_videos_partial: t0:tag_shorts:p1 nico_page_http_503')
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.authors['1001']?.posts.map((p) => p.id)).toEqual(['sm92'])
    // 取れなかったページは次回の重なり（6 時間）で取り直すので、最終取得時刻は進める
    expect(tracking.lastPollAt).toBe(T0.toISOString())
  })

  it('予備で取れた回は最終取得時刻を進める', async () => {
    const m = await afterFirstPoll()
    const primary = vi.fn(async () => {
      throw new Error('server-response meta not found')
    })
    const fallback = vi.fn(async () => [video({ id: 'sm91' })])
    await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback }, later), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(later.toISOString())
  })
})

describe('lqng-poller 退会（ユーザー情報 API の 404）の確定', () => {
  const deleted: UserInfo = { status: 'deleted', followerCount: null, nickname: null }
  const hours = (h: number): Date => new Date(T0.getTime() + h * 3600_000)

  it('1 回目の 404 は疑いにとどめ、1 時間以上あけた 2 回目の 404 で確定する（1 時間未満では再確認しない）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const burst = [video({ id: 'sm10', registeredAt: at(-3) }), video({ id: 'sm11', registeredAt: at(-2) }), video({ id: 'sm12', registeredAt: at(-1) })]
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(burst)), fetchUserInfo: vi.fn(async () => existing(0)) }), 'poll')

    const gone = vi.fn(async () => deleted)
    await runPoll(m.kv, deps({ fetchUserInfo: gone }, hours(7)), 'poll')
    let author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']!
    expect(author.status).toBe('existing')
    expect(author.deletionSuspectedAt).toBe(hours(7).toISOString())
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'author_deleted')).toBe(false)

    gone.mockClear()
    await runPoll(m.kv, deps({ fetchUserInfo: gone }, hours(7.5)), 'poll')
    expect(gone).not.toHaveBeenCalled()

    await runPoll(m.kv, deps({ fetchUserInfo: gone }, hours(8)), 'poll')
    author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']!
    expect(author.status).toBe('deleted')
    expect(author.deletedObservedAt).toBe(hours(7).toISOString())
    expect(author.deletionSuspectedAt).toBeNull()
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']?.reasons).toEqual(['A_C'])
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'author_deleted' && e.authorId === '1001')).toBe(true)
  })

  it('404 の後に存在が確認できれば疑いを外す', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const burst = [video({ id: 'sm10', registeredAt: at(-3) }), video({ id: 'sm11', registeredAt: at(-2) }), video({ id: 'sm12', registeredAt: at(-1) })]
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(burst)), fetchUserInfo: vi.fn(async () => deleted) }), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']?.deletionSuspectedAt).toBe(T0.toISOString())
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => existing(4)) }, hours(1)), 'poll')
    const author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']!
    expect(author.deletionSuspectedAt).toBeNull()
    expect(author.status).toBe('existing')
    expect(author.followerCount).toBe(4)
    // さらに 1 時間後に 404 が来ても、それは新しい疑いであって確定ではない
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => deleted) }, hours(7)), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']?.status).toBe('existing')
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
  })

  it('確認した人数の 80% 以上が 404 なら、その回の退会判定をすべて保留して記録する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const uploads = Array.from({ length: 6 }, (_, i) => video({ id: `sm${300 + i}`, authorId: String(3100 + i) }))
    const info = vi.fn(async (id: string) => (id === '3105' ? existing(7) : deleted))
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads)), fetchUserInfo: info }), 'poll')
    expect(info).toHaveBeenCalledTimes(6)
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    for (let i = 0; i < 5; i++) expect(tracking.authors[String(3100 + i)]?.deletionSuspectedAt ?? null).toBeNull()
    // 404 以外の結果はそのまま反映する
    expect(tracking.authors['3105']?.followerCount).toBe(7)
    const held = m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.find((e) => e.kind === 'deletion_held')
    expect(held?.note).toBe('404 5/6')
    expect(tracking.lastRun?.note).toContain('deletion_held')
  })

  it('404 が 80% 未満なら通常どおり疑いを記録する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const uploads = Array.from({ length: 5 }, (_, i) => video({ id: `sm${310 + i}`, authorId: String(3200 + i) }))
    const info = vi.fn(async (id: string) => (id === '3203' || id === '3204' ? existing(7) : deleted))
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads)), fetchUserInfo: info }), 'poll')
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(['3200', '3201', '3202'].map((id) => tracking.authors[id]?.deletionSuspectedAt)).toEqual([T0.toISOString(), T0.toISOString(), T0.toISOString()])
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'deletion_held') ?? false).toBe(false)
  })

  describe('退会扱いの投稿者の再確認', () => {
    const deletedAt = T0.toISOString()
    const oldPost = new Date(T0.getTime() - 6 * 24 * 3600_000).toISOString()
    function seeded() {
      const tracking: LqngTracking = {
        version: 1,
        lastPollAt: deletedAt,
        lastSweepDate: null,
        authors: {
          '1001': { authorId: '1001', firstSeenAt: oldPost, lastPostAt: oldPost, posts: [{ id: 'sm1', title: 't', at: oldPost, tagDetails: null, ownerVisibility: 'visible' }], status: 'deleted', lastCheckedAt: deletedAt, followerCount: null, nickname: 'n', visibility: 'visible', deletedObservedAt: deletedAt, deletionSuspectedAt: null },
        },
        pending: [],
        lastRun: null,
        recentRuns: [],
        updatedAt: deletedAt,
      }
      const verdicts: LqngVerdicts = {
        version: 1,
        authors: { '1001': { status: 'ng', reasons: ['A_C'], since: deletedAt, evidence: [], nickname: 'n', followerCount: null, visibility: 'visible', deletedObservedAt: deletedAt } },
        videos: {},
        updatedAt: deletedAt,
      }
      return memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: tracking, [LQNG_KV_KEYS.verdicts]: verdicts })
    }

    it('7 日たつまでは再確認せず、投稿が古くなっても追跡から外さない', async () => {
      const m = seeded()
      const info = vi.fn(async () => existing(5))
      await runPoll(m.kv, deps({ fetchUserInfo: info }, hours(3 * 24)), 'poll')
      expect(info).not.toHaveBeenCalled()
      const author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']
      expect(author?.status).toBe('deleted')
      expect(author?.posts).toEqual([])
    })

    it('7 日後に存在が確認できれば退会扱いを外し、投稿者 NG は外さずに記録する', async () => {
      const m = seeded()
      await runPoll(m.kv, deps({}, hours(3 * 24)), 'poll')
      const info = vi.fn(async () => existing(5))
      await runPoll(m.kv, deps({ fetchUserInfo: info }, hours(7 * 24 + 1)), 'poll')
      expect(info).toHaveBeenCalledWith('1001')
      // 追跡中の投稿はもう無いので追跡からは外れうるが、残っていれば退会扱いは外れている
      const author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']
      if (author) {
        expect(author.status).toBe('existing')
        expect(author.deletedObservedAt).toBeNull()
      }
      const verdict = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!.authors['1001']
      expect(verdict?.status).toBe('ng')
      expect(verdict?.reasons).toEqual(['A_C'])
      expect(verdict?.deletedObservedAt).toBeNull()
      expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'author_restored' && e.authorId === '1001')).toBe(true)
    })

    it('再確認でも 404 なら退会のまま、その後は通常どおり追跡から外す', async () => {
      const m = seeded()
      const info = vi.fn(async () => deleted)
      await runPoll(m.kv, deps({ fetchUserInfo: info }, hours(7 * 24 + 1)), 'poll')
      expect(info).toHaveBeenCalledWith('1001')
      // 再確認は 1 回だけ。投稿はもう無いので、遅くとも次の実行で追跡から外れる
      await runPoll(m.kv, deps({ fetchUserInfo: info }, hours(7 * 24 + 2)), 'poll')
      expect(info).toHaveBeenCalledTimes(1)
      expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']).toBeUndefined()
      expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'author_restored') ?? false).toBe(false)
      const verdict = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!.authors['1001']
      expect(verdict?.reasons).toEqual(['A_C'])
      expect(verdict?.deletedObservedAt).toBe(deletedAt)
    })
  })
})

describe('lqng-poller 保存の順番', () => {
  it('判定表を先に、履歴・受け箱の削除を経て、追跡表を最後に書く', async () => {
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: config,
      'lqng:inbox:run1:000001': { version: 1, runId: 'run1', seq: 1, at: T0.toISOString(), deltas: { authors: { '8001': { status: 'ng', reasons: ['B'], since: 's', evidence: [] } }, videos: {} } },
    })
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm95', title: 'て/す/と/ま/ん' })])) }), 'poll')
    const writes = m.ops.filter((op) => op.startsWith('put ') || op.startsWith('delete '))
    expect(writes).toEqual([`put ${LQNG_KV_KEYS.verdicts}`, `put ${LQNG_KV_KEYS.events}`, 'delete lqng:inbox:run1:000001', `put ${LQNG_KV_KEYS.tracking}`])
  })

  it('判定表の保存に失敗したら追跡表は書かず、次回に同じ新着を取り直して判定する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const failing = { ...m.kv, put: async (key: string, value: string) => {
      if (key === LQNG_KV_KEYS.verdicts) throw new Error('kv put failed')
      await m.kv.put(key, value)
    } }
    const fetchNew = vi.fn(async () => pages([video({ id: 'sm96', title: 'て/す/と/ま/ん' })]))
    await expect(runPoll(failing, deps({ fetchNewVideos: fetchNew }), 'poll')).rejects.toThrow('kv put failed')
    expect(m.store.has(LQNG_KV_KEYS.tracking)).toBe(false)
    const r = await runPoll(m.kv, deps({ fetchNewVideos: fetchNew }, new Date(T0.getTime() + 15 * 60_000)), 'poll')
    expect(r.newVideos).toBe(1)
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.videos.sm96?.status).toBe('ng')
  })
})

describe('lqng-poller 追跡の刈り込みの順番', () => {
  it('停止明けでも、追跡期間を過ぎた古い連投では A∧C を成立させない（刈り込んでから退会を確かめる）', async () => {
    const days = (d: number): string => new Date(T0.getTime() - d * 24 * 3600_000).toISOString()
    const suspectedAt = new Date(T0.getTime() - 2 * 3600_000).toISOString()
    const tracking: LqngTracking = {
      version: 1,
      lastPollAt: days(8), // 8 日間止まっていた
      lastSweepDate: null,
      authors: {
        '1001': {
          authorId: '1001',
          firstSeenAt: days(8),
          lastPostAt: days(1),
          posts: [
            // 8 日前の連投（追跡期間 7 日の外）と、1 日前の 1 本
            { id: 'sm1', title: 't', at: days(8), tagDetails: [], ownerVisibility: 'visible' },
            { id: 'sm2', title: 't', at: new Date(new Date(days(8)).getTime() + 60_000).toISOString(), tagDetails: [], ownerVisibility: 'visible' },
            { id: 'sm3', title: 't', at: new Date(new Date(days(8)).getTime() + 120_000).toISOString(), tagDetails: [], ownerVisibility: 'visible' },
            { id: 'sm4', title: 't', at: days(1), tagDetails: [], ownerVisibility: 'visible' },
          ],
          status: 'existing',
          lastCheckedAt: suspectedAt,
          followerCount: 100,
          nickname: 'n',
          visibility: 'visible',
          deletedObservedAt: null,
          deletionSuspectedAt: suspectedAt,
        },
      },
      pending: [],
      lastRun: null,
      recentRuns: [],
      updatedAt: days(8),
    }
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: tracking })
    const info = vi.fn(async (): Promise<UserInfo> => ({ status: 'deleted', followerCount: null, nickname: null }))
    await runPoll(m.kv, deps({ fetchUserInfo: info }), 'poll')
    expect(info).toHaveBeenCalledWith('1001')
    const author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']!
    expect(author.status).toBe('deleted') // 退会は確定する
    expect(author.posts.map((p) => p.id)).toEqual(['sm4'])
    // 古い連投は刈り込まれているので投稿頻度 C に当たらず、A∧C にはならない
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
  })
})

describe('lqng-poller getthumbinfo の失敗の扱い', () => {
  const unavailable: ThumbResult = { ok: false, reason: 'unavailable' }
  const later = (n: number): Date => new Date(T0.getTime() + n * 15 * 60_000)

  it('5xx や通信失敗は試行回数に数えず、補完待ちに残す', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm500' })])), fetchThumbInfo: vi.fn(async () => unavailable) }), 'poll')
    for (let i = 1; i <= 2; i++) {
      await runPoll(m.kv, deps({ fetchThumbInfo: vi.fn(async () => { throw new Error('network') }) }, later(i)), 'poll')
    }
    for (let i = 3; i <= 5; i++) await runPoll(m.kv, deps({ fetchThumbInfo: vi.fn(async () => unavailable) }, later(i)), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.pending).toEqual([{ id: 'sm500', authorId: '1001', attempts: 0 }])
  })

  it('確かな失敗（error）は試行回数に数え、上限で諦める', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const failing = vi.fn(async (): Promise<ThumbResult> => ({ ok: false, reason: 'error' }))
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm501' })])), fetchThumbInfo: failing }), 'poll')
    for (let i = 1; i < LIMITS.pendingMaxAttempts; i++) await runPoll(m.kv, deps({ fetchThumbInfo: failing }, later(i)), 'poll')
    expect(failing).toHaveBeenCalledTimes(LIMITS.pendingMaxAttempts)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.pending).toEqual([])
  })

  it('続けて一時的な失敗が起きたら上流の障害とみなし、その回の補完を打ち切って残りを持ち越す', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const many = Array.from({ length: 8 }, (_, i) => video({ id: `sm${510 + i}`, authorId: String(5100 + i) }))
    const thumb = vi.fn(async () => unavailable)
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(many)), fetchThumbInfo: thumb }), 'poll')
    expect(thumb).toHaveBeenCalledTimes(LIMITS.thumbUnavailableAbort)
    const pending = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.pending
    expect(pending).toHaveLength(8)
    expect(pending.every((p) => p.attempts === 0)).toBe(true)
    expect(r.note).toContain('getthumbinfo_unavailable')
  })
})
