import { describe, it, expect, vi } from 'vitest'
import { runPoll, LIMITS } from '@/workers/lqng-poller/src/poll'
import { commitBackfill } from '@/workers/lqng-poller/src/backfill'
import { AccessLimitedError, type NewVideosResult, type PageFailure, type PollDeps, type SourceVideo, type ThumbResult, type UserInfo } from '@/workers/lqng-poller/src/sources'
import { LQNG_ISSUE_CONTROL_NOT_FOUND, LQNG_KV_KEYS, isLqngControlNotFound } from '@/lib/lqng/config'
import type { LqngConfig, LqngVerdicts } from '@/lib/lqng/types'
import { captureBaseline, emptyEvents, emptyTracking, verdictsWriteProblem, type LqngEvents, type LqngTracking, type TrackedAuthor } from '@/workers/lqng-poller/src/state'
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
  // 追跡中に存在確認済みの投稿者がいないときに使う対照（合成値）
  controlUserId: '1999',
}

const T0 = new Date('2026-02-01T12:00:00+09:00')
const at = (min: number): string => new Date(T0.getTime() + min * 60_000).toISOString()

const video = (over: Partial<SourceVideo>): SourceVideo => ({ id: 'sm1', title: '通常', authorId: '1001', registeredAt: at(-1), ownerVisibility: 'visible', ...over })
/** 主経路（本家タグページ）の取得結果（既定は 2 タグ × 2 種別 × 1 ページ = 4 リクエスト） */
const pages = (videos: SourceVideo[], failures: PageFailure[] = [], requests = 4): NewVideosResult => ({ videos, failures, requests })
/** 取れなかったページ（tagIndex は設定の pollTags の並び順） */
const failed = (tagIndex: number, kind: PageFailure['kind'], reason = 'nico_page_http_503'): PageFailure => ({ tagIndex, kind, page: 1, reason })
/** 設定の 2 タグ × 2 種別がすべて取れなかった結果 */
const allFailed = (reason: string): NewVideosResult => pages([], [failed(0, 'tag', reason), failed(0, 'tag_shorts', reason), failed(1, 'tag', reason), failed(1, 'tag_shorts', reason)])
const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))
const okThumb = (tags = locked('x')): ThumbResult => ({ ok: true, info: { tagDetails: tags, ownerVisibility: 'visible', nickname: 'n' } })
const existing = (followerCount: number): UserInfo => ({ status: 'existing', followerCount, nickname: 'n' })
const deletedInfo: UserInfo = { status: 'deleted', followerCount: null, nickname: null }
/** 対照（controlUserId）だけは存在し、ほかは退会（NOT_FOUND の 404）と答えるユーザー情報 API */
const goneExceptControl = () => vi.fn(async (id: string): Promise<UserInfo> => (id === '1999' ? existing(1000) : deletedInfo))

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
    const primary = vi.fn(async () => allFailed('server-response meta not found'))
    const fallback = vi.fn(async () => [video({ id: 'sm70', authorId: '7001' })])
    const r = await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback }), 'poll')
    expect(r.skipped).toBeNull()
    expect(fallback).toHaveBeenCalledWith(['tagA', 'tagB'], expect.any(String))
    expect(r.newVideos).toBe(1)
    expect(r.note).toContain('fallback(t0,t1): ok')
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.some((e) => e.kind === 'error' && e.note?.includes('server-response meta not found'))).toBe(true)
  })

  it('連投中の投稿者は待ち行列が長くても先に存在確認・補完される', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    // 通常の投稿者 12 人（各 1 本、先に観測）と、最後に観測された連投者 1 人（4 本を 6 分以内）
    const normal = Array.from({ length: 12 }, (_, i) => video({ id: `n${i}`, authorId: `${3000 + i}`, registeredAt: at(-60 - i) }))
    const burst = Array.from({ length: 4 }, (_, i) => video({ id: `b${i}`, authorId: '4000', registeredAt: at(-2 - i) }))
    const fetchUserInfo = vi.fn(async (id: string) => (id === '4000' ? ({ status: 'deleted', followerCount: null, nickname: null } as UserInfo) : existing(100)))
    const fetchThumbInfo = vi.fn(async (_id: string) => okThumb())
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
    await runPoll(m.kv, deps({ fetchUserInfo: goneExceptControl() }, later), 'poll')
    // 1 回目の 404 は疑いだけ（まだ NG にしない）
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
    const confirmAt = new Date(later.getTime() + 60 * 60_000)
    await runPoll(m.kv, deps({ fetchUserInfo: goneExceptControl() }, confirmAt), 'poll')
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
    await runPoll(m.kv, deps({ fetchUserInfo: goneExceptControl() }, later), 'poll')
    await runPoll(m.kv, deps({ fetchUserInfo: goneExceptControl() }, new Date(later.getTime() + 60 * 60_000)), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.authors['1001']?.status).toBe('deleted')
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

  it('投稿者 ID の無い動画も、重なり区間で毎回新着として数え直さない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const anonymous = vi.fn(async () => pages([video({ id: 'sm61', authorId: null })]))
    const r1 = await runPoll(m.kv, deps({ fetchNewVideos: anonymous }), 'poll')
    expect(r1.newVideos).toBe(1)
    const r2 = await runPoll(m.kv, deps({ fetchNewVideos: anonymous }, new Date(T0.getTime() + 15 * 60_000)), 'poll')
    expect(r2.newVideos).toBe(0)
    // 追跡期間を過ぎたら覚えておかない
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.unattributed).toEqual([{ id: 'sm61', at: at(-1) }])
    await runPoll(m.kv, deps({}, new Date(T0.getTime() + 8 * 24 * 3600_000)), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.unattributed).toEqual([])
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

  it('保留中・解放済みの動画にも、受け箱の動画 NG を反映する（NG は保留・解放より強い。既に NG なら変えない）', async () => {
    const at0 = '2026-01-31T00:00:00.000Z'
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: config,
      [LQNG_KV_KEYS.verdicts]: {
        version: 1,
        authors: {},
        videos: {
          sm801: { status: 'hold', reasons: [], holdSignals: ['hidden_owner'], authorId: '7501', title: 't', registeredAt: at0, since: at0, holdUntil: '2026-02-01T09:00:00.000Z' },
          sm802: { status: 'released', reasons: [], authorId: '7502', title: 't', registeredAt: at0, since: at0, holdUntil: null },
          sm803: { status: 'ng', reasons: ['B'], authorId: '7503', title: 't', registeredAt: at0, since: at0 },
        },
        updatedAt: at0,
      },
      'lqng:inbox:run1:000001': inboxItem(1, { authors: {}, videos: { sm801: videoVerdict('7501'), sm802: videoVerdict('7502'), sm803: videoVerdict('7503') } }),
    })
    await runPoll(m.kv, deps(), 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    expect(verdicts.videos.sm801).toMatchObject({ status: 'ng', reasons: ['D'], since: T0.toISOString() })
    expect(verdicts.videos.sm802).toMatchObject({ status: 'ng', reasons: ['D'], since: T0.toISOString() })
    expect(verdicts.videos.sm803).toMatchObject({ status: 'ng', reasons: ['B'], since: at0 })
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.find((e) => e.kind === 'backfill')?.note).toBe('投稿者 +0 / 動画 +2')
  })

  it('投稿者 ID の無い NG 差分で保留を上書きするときも投稿者 ID を引き継ぎ、許可リストの投稿者の動画は NG にしない', async () => {
    const at0 = '2026-01-31T00:00:00.000Z'
    const hold = (authorId: string) => ({ status: 'hold', reasons: [], holdSignals: ['hidden_owner'], authorId, title: 't', registeredAt: at0, since: at0, holdUntil: '2026-02-01T09:00:00.000Z' })
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: config,
      [LQNG_KV_KEYS.verdicts]: { version: 1, authors: {}, videos: { sm811: hold('9001'), sm812: hold('7601') }, updatedAt: at0 },
      'lqng:inbox:run1:000001': inboxItem(1, { authors: {}, videos: { sm811: videoVerdict(null), sm812: videoVerdict(null) } }),
    })
    await runPoll(m.kv, deps(), 'poll')
    const verdicts = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!
    // 許可リストの投稿者（9001）の動画は NG にせず、投稿者 ID も残る（保留は許可リストなので通常どおり解放される）
    expect(verdicts.videos.sm811?.status).not.toBe('ng')
    expect(verdicts.videos.sm811?.authorId).toBe('9001')
    // それ以外は NG になるが、投稿者 ID は既存の判定から引き継ぐ
    expect(verdicts.videos.sm812).toMatchObject({ status: 'ng', authorId: '7601' })
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

  it('一覧に出ても読むと無くなっていた受け箱（結果整合のずれ）は、合流も削除もせずに飛ばす', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const kv = {
      ...m.kv,
      list: async () => ({ keys: [{ name: 'lqng:inbox:run1:000001' }], list_complete: true }),
    }
    const r = await runPoll(kv, deps(), 'poll')
    expect(r.skipped).toBeNull()
    expect(m.deletes).toEqual([])
    expect(m.store.has(LQNG_KV_KEYS.verdicts)).toBe(false)
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'error') ?? false).toBe(false)
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

  it('通常動画のページだけ形が変わっても、そのタグは予備（nvapi）で補い、ショートは本家から取り込む', async () => {
    const m = await afterFirstPoll()
    const primary = vi.fn(async () =>
      pages([video({ id: 'ss80', authorId: '8001' })], [failed(0, 'tag', 'server-response meta not found'), failed(1, 'tag', 'server-response meta not found')])
    )
    const fallback = vi.fn(async () => [video({ id: 'sm81', authorId: '8002' })])
    const reportError = vi.fn()
    const r = await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback, reportError }, later), 'poll')
    expect(fallback).toHaveBeenCalledWith(['tagA', 'tagB'], expect.any(String))
    expect(r.newVideos).toBe(2)
    // ショートは取れ、通常動画は予備で補えたので、最終取得時刻は進める
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.lastPollAt).toBe(later.toISOString())
    // 本家ページの失敗は履歴と監視に出す
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'error' && e.note?.includes('t0:tag:p1 server-response meta not found'))).toBe(true)
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(r.note).toContain('fallback(t0,t1): ok')
  })

  it('一部のタグの通常動画だけ取れなければ、そのタグだけ予備で補う', async () => {
    const m = await afterFirstPoll()
    const fallback = vi.fn(async () => [])
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([], [failed(1, 'tag')])), fetchNewVideosFallback: fallback }, later), 'poll')
    expect(fallback).toHaveBeenCalledWith(['tagB'], expect.any(String))
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(later.toISOString())
  })

  it('ショートが取れなかった回は予備では補えないので最終取得時刻を進めず、次の回に同じ区間を取り直す', async () => {
    const m = await afterFirstPoll()
    const fallback = vi.fn(async () => [])
    const reportError = vi.fn()
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([], [failed(0, 'tag_shorts')])), fetchNewVideosFallback: fallback, reportError }, later), 'poll')
    expect(fallback).not.toHaveBeenCalled()
    expect(r.note).toContain('new_videos_failed: t0:tag_shorts:p1 nico_page_http_503')
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(T0.toISOString())
    // 次の回: 前回の最終取得時刻から重なり分を取り直し、取れなかったショートを取り込む
    const missed = video({ id: 'ss82', authorId: '8003', registeredAt: at(5) })
    const next = vi.fn(async () => pages([missed]))
    const nextAt = new Date(later.getTime() + 15 * 60_000)
    const r2 = await runPoll(m.kv, deps({ fetchNewVideos: next }, nextAt), 'poll')
    const since = (next.mock.calls[0] as unknown as [string[], string])[1]
    expect(since).toBe(new Date(T0.getTime() - LIMITS.sinceOverlapMinutes * 60_000).toISOString())
    expect(r2.newVideos).toBe(1)
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.authors['8003']?.posts.map((p) => p.id)).toEqual(['ss82'])
    expect(tracking.lastPollAt).toBe(nextAt.toISOString())
  })

  it('予備もアクセス制限なら最終取得時刻を進めない', async () => {
    const m = await afterFirstPoll()
    const fallback = vi.fn(async () => {
      throw new AccessLimitedError('nvapi')
    })
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([], [failed(0, 'tag', 'nico_page_http_403')])), fetchNewVideosFallback: fallback }, later), 'poll')
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(T0.toISOString())
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'access_limited' && e.note === 'access limited: nvapi')).toBe(true)
  })

  it('主経路も予備も壊れていれば、記録して他の処理は続け、最終取得時刻は進めない', async () => {
    const m = await afterFirstPoll()
    const primary = vi.fn(async () => allFailed('nico_page_http_500'))
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
    expect(events.items.some((e) => e.kind === 'error' && e.note?.includes('fallback(t0,t1): nvapi_http_503'))).toBe(true)
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('通常動画を予備で補えても、ショートが取れていない回は最終取得時刻を進めない', async () => {
    const m = await afterFirstPoll()
    const fallback = vi.fn(async () => [video({ id: 'sm91' })])
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => allFailed('server-response meta not found')), fetchNewVideosFallback: fallback }, later), 'poll')
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(T0.toISOString())
  })

  it('想定外の例外で新着を取れなかった回も、全ページ失敗として予備で補い、最終取得時刻は進めない', async () => {
    const m = await afterFirstPoll()
    const primary = vi.fn(async (): Promise<NewVideosResult> => {
      throw new Error('unexpected')
    })
    const fallback = vi.fn(async () => [video({ id: 'sm92' })])
    const r = await runPoll(m.kv, deps({ fetchNewVideos: primary, fetchNewVideosFallback: fallback }, later), 'poll')
    expect(fallback).toHaveBeenCalledWith(['tagA', 'tagB'], expect.any(String))
    expect(r.newVideos).toBe(1)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastPollAt).toBe(T0.toISOString())
  })

  it('同じ失敗が続く間、履歴には最初の 1 回だけ積み、注記には毎回出す（3 回続けて直ってからの失敗はまた積む）', async () => {
    const m = await afterFirstPoll()
    const reportError = vi.fn()
    const failing = deps({ fetchNewVideos: vi.fn(async () => pages([], [failed(0, 'tag_shorts')])), reportError }, later)
    const errorsIn = (): number => m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.filter((e) => e.kind === 'error' && e.note?.includes('tag_shorts')).length ?? 0
    const minutes = (n: number): Date => new Date(later.getTime() + n * 60_000)
    await runPoll(m.kv, failing, 'poll')
    const r2 = await runPoll(m.kv, { ...failing, now: () => minutes(15) }, 'poll')
    expect(errorsIn()).toBe(1)
    expect(r2.note).toContain('new_videos_failed')
    // 1 回直っただけでは解除しない
    await runPoll(m.kv, deps({}, minutes(30)), 'poll')
    await runPoll(m.kv, { ...failing, now: () => minutes(45) }, 'poll')
    expect(errorsIn()).toBe(1)
    // 3 回続けて直ったら解除し、次の失敗はまた積む
    for (const n of [60, 75, 90]) await runPoll(m.kv, deps({}, minutes(n)), 'poll')
    await runPoll(m.kv, { ...failing, now: () => minutes(105) }, 'poll')
    expect(errorsIn()).toBe(2)
    expect(reportError).toHaveBeenCalledTimes(2)
  })

  it('失敗と成功が交互に続いても、履歴には 1 回、監視への報告は 6 時間に 1 回に抑える', async () => {
    const m = await afterFirstPoll()
    const reportError = vi.fn()
    for (let i = 1; i <= 96; i++) {
      const fail = i % 2 === 1
      await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([], fail ? [failed(0, 'tag_shorts')] : [])), reportError }, new Date(T0.getTime() + i * 15 * 60_000)), 'poll')
    }
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.filter((e) => e.kind === 'error').length).toBe(1)
    expect(reportError).toHaveBeenCalledTimes(4)
  })

  it('同じ問題の監視への報告は 6 時間に 1 回に間引き、内容が変われば間を置かずに出す', async () => {
    const m = await afterFirstPoll()
    const reportError = vi.fn()
    const run = (i: number, failures: PageFailure[]) =>
      runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([], failures)), reportError }, new Date(T0.getTime() + i * 15 * 60_000)), 'poll')
    for (let i = 1; i <= 24; i++) await run(i, [failed(0, 'tag_shorts')]) // 6 時間続く
    expect(reportError).toHaveBeenCalledTimes(1)
    await run(25, [failed(0, 'tag_shorts')]) // 最初の報告から 6 時間
    expect(reportError).toHaveBeenCalledTimes(2)
    await run(26, [failed(0, 'tag_shorts'), failed(1, 'tag_shorts')]) // 内容が変わった
    expect(reportError).toHaveBeenCalledTimes(3)
  })
})

describe('lqng-poller 退会（ユーザー情報 API の 404）の確定', () => {
  const deleted = deletedInfo
  const hours = (h: number): Date => new Date(T0.getTime() + h * 3600_000)

  it('1 回目の 404 は疑いにとどめ、1 時間以上あけた 2 回目の 404 で確定する（1 時間未満では再確認しない）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const burst = [video({ id: 'sm10', registeredAt: at(-3) }), video({ id: 'sm11', registeredAt: at(-2) }), video({ id: 'sm12', registeredAt: at(-1) })]
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(burst)), fetchUserInfo: vi.fn(async () => existing(0)) }), 'poll')

    const gone = goneExceptControl()
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
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(burst)), fetchUserInfo: goneExceptControl() }), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']?.deletionSuspectedAt).toBe(T0.toISOString())
    await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async () => existing(4)) }, hours(1)), 'poll')
    const author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']!
    expect(author.deletionSuspectedAt).toBeNull()
    expect(author.status).toBe('existing')
    expect(author.followerCount).toBe(4)
    // さらに 1 時間後に 404 が来ても、それは新しい疑いであって確定ではない
    await runPoll(m.kv, deps({ fetchUserInfo: goneExceptControl() }, hours(7)), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']?.status).toBe('existing')
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
  })

  describe('404 が出た回の対照（存在が分かっている ID）の確認', () => {
    const recent = new Date(T0.getTime() - 60 * 60_000).toISOString()
    /** 追跡中で、少し前に存在を確認した投稿者（対照の候補）を置く */
    const controlAuthor = (id: string, followerCount: number, lastCheckedAt = recent): TrackedAuthor => ({
      authorId: id,
      firstSeenAt: recent,
      lastPostAt: recent,
      posts: [{ id: `sm${id}`, title: 't', at: recent, tagDetails: [], ownerVisibility: 'visible' }],
      status: 'existing',
      lastCheckedAt,
      followerCount,
      nickname: 'n',
      visibility: 'visible',
      deletedObservedAt: null,
      deletionSuspectedAt: null,
    })
    const trackingWith = (authors: TrackedAuthor[]): LqngTracking => ({
      version: 1,
      lastPollAt: null,
      lastSweepDate: null,
      authors: Object.fromEntries(authors.map((a) => [a.authorId, a])),
      pending: [],
      unattributed: [],
      lastRun: null,
      recentRuns: [],
      issues: {},
      updatedAt: recent,
    })
    const uploads = (n: number, base: number) => Array.from({ length: n }, (_, i) => video({ id: `sm${base + i}`, authorId: String(base + i) }))
    const noControlConfig = { ...config, controlUserId: null }

    it('対照が存在すれば、404 の割合に関係なく進める（確認した全員が 404 でも疑いを記録する）', async () => {
      const m = memoryKv({ [LQNG_KV_KEYS.config]: noControlConfig, [LQNG_KV_KEYS.tracking]: trackingWith([controlAuthor('1900', 5000), controlAuthor('1901', 50)]) })
      const info = vi.fn(async (id: string): Promise<UserInfo> => (id === '1900' || id === '1901' ? existing(5000) : deleted))
      await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(6, 3100))), fetchUserInfo: info }), 'poll')
      // 対照はフォロワーの多い順に選ぶ
      expect(info).toHaveBeenCalledWith('1900')
      expect(info).not.toHaveBeenCalledWith('1901')
      const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
      for (let i = 0; i < 6; i++) expect(tracking.authors[String(3100 + i)]?.deletionSuspectedAt).toBe(T0.toISOString())
      expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'deletion_held') ?? false).toBe(false)
    })

    it('対照も 404 なら退会判定をすべて保留し、保留した 404 の lastCheckedAt は進めずに次の回で確かめ直す', async () => {
      const m = memoryKv({ [LQNG_KV_KEYS.config]: noControlConfig, [LQNG_KV_KEYS.tracking]: trackingWith([controlAuthor('1900', 5000)]) })
      const allGone = vi.fn(async (): Promise<UserInfo> => deleted)
      const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(2, 3200))), fetchUserInfo: allGone }), 'poll')
      expect(allGone).toHaveBeenCalledWith('1900')
      const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
      for (const id of ['3200', '3201']) {
        expect(tracking.authors[id]?.deletionSuspectedAt ?? null).toBeNull()
        expect(tracking.authors[id]?.lastCheckedAt).toBeNull()
      }
      expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.find((e) => e.kind === 'deletion_held')?.note).toContain('control_404')
      expect(r.note).toContain('deletion_held')
      // API が戻れば、次の回に確かめ直して疑いを記録する
      const recovered = vi.fn(async (id: string): Promise<UserInfo> => (id === '1900' ? existing(5000) : deleted))
      await runPoll(m.kv, deps({ fetchUserInfo: recovered }, new Date(T0.getTime() + 15 * 60_000)), 'poll')
      expect(recovered).toHaveBeenCalledWith('3200')
      expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['3200']?.deletionSuspectedAt).toBe(new Date(T0.getTime() + 15 * 60_000).toISOString())
    })

    it('確認が 1 人（5 人未満）でも対照を確かめ、対照も 404 なら退会を確定しない', async () => {
      const suspectedAt = new Date(T0.getTime() - 2 * 3600_000).toISOString()
      const suspect: TrackedAuthor = {
        ...controlAuthor('1001', 0, suspectedAt),
        posts: [0, 1, 2].map((i) => ({ id: `sm${20 + i}`, title: 't', at: at(-10 - i), tagDetails: [], ownerVisibility: 'visible' as const })),
        deletionSuspectedAt: suspectedAt,
      }
      const m = memoryKv({ [LQNG_KV_KEYS.config]: noControlConfig, [LQNG_KV_KEYS.tracking]: trackingWith([suspect, controlAuthor('1900', 5000)]) })
      await runPoll(m.kv, deps({ fetchUserInfo: vi.fn(async (): Promise<UserInfo> => deleted) }), 'poll')
      const author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']!
      expect(author.status).toBe('existing')
      expect(author.deletionSuspectedAt).toBe(suspectedAt)
      expect(author.lastCheckedAt).toBe(suspectedAt)
      expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
    })

    it('追跡中に対照が無ければ設定の controlUserId を確かめ、どちらも無ければ保留する', async () => {
      const withSetting = memoryKv({ [LQNG_KV_KEYS.config]: config })
      const info = goneExceptControl()
      await runPoll(withSetting.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3300))), fetchUserInfo: info }), 'poll')
      expect(info).toHaveBeenCalledWith('1999')
      expect(withSetting.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['3300']?.deletionSuspectedAt).toBe(T0.toISOString())

      const without = memoryKv({ [LQNG_KV_KEYS.config]: noControlConfig })
      await runPoll(without.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3300))), fetchUserInfo: goneExceptControl() }), 'poll')
      expect(without.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['3300']?.deletionSuspectedAt ?? null).toBeNull()
      expect(without.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.find((e) => e.kind === 'deletion_held')?.note).toContain('no_control')
    })

    it('対照が見つからない・確かめられない状態が続くときも監視に出す（6 時間に 1 回）', async () => {
      const m = memoryKv({ [LQNG_KV_KEYS.config]: noControlConfig })
      const reportError = vi.fn()
      const info = vi.fn(async (): Promise<UserInfo> => deleted)
      await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3700))), fetchUserInfo: info, reportError }), 'poll')
      expect(reportError).toHaveBeenCalledTimes(1)
      expect(reportError.mock.calls[0]?.[1]).toBe('deletion_held')
      expect(String(reportError.mock.calls[0]?.[0])).toContain('no_control')
      for (let i = 1; i < 24; i++) await runPoll(m.kv, deps({ fetchUserInfo: info, reportError }, new Date(T0.getTime() + i * 15 * 60_000)), 'poll')
      expect(reportError).toHaveBeenCalledTimes(1)
      await runPoll(m.kv, deps({ fetchUserInfo: info, reportError }, new Date(T0.getTime() + 6 * 3600_000)), 'poll')
      expect(reportError).toHaveBeenCalledTimes(2)
    })

    it('設定の controlUserId があれば、追跡中の投稿者より先に対照にする', async () => {
      const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: trackingWith([controlAuthor('1900', 5000)]) })
      const info = vi.fn(async (id: string): Promise<UserInfo> => (id === '1999' || id === '1900' ? existing(5000) : deleted))
      await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3500))), fetchUserInfo: info }), 'poll')
      expect(info.mock.calls.map((c) => c[0])).toEqual(['3500', '1999'])
    })

    describe('設定の対照が見つからない・確かめられないとき', () => {
      /** 設定の対照 1999 は 404（打ち間違い・退会）、追跡中の候補 1912 は存在、ほかは 404 */
      const configuredGone = () => vi.fn(async (id: string): Promise<UserInfo> => (id === '1912' ? existing(50) : deleted))
      /** 設定の対照が前の回に 404 だった追跡表 */
      const knownNotFound = (authors: TrackedAuthor[]): LqngTracking => ({
        ...trackingWith(authors),
        issues: { [LQNG_ISSUE_CONTROL_NOT_FOUND]: { signature: '1999', okStreak: 0, reportedAt: recent } },
      })

      it('設定の対照が 404 なら追跡中の候補で確かめ直して退会を確定でき、見つからないことを概要と監視に出す', async () => {
        const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: trackingWith([controlAuthor('1912', 50)]) })
        const info = configuredGone()
        const reportError = vi.fn()
        await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3800))), fetchUserInfo: info, reportError }), 'poll')
        expect(info.mock.calls.map((c) => c[0])).toEqual(['3800', '1999', '1912'])
        let tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
        expect(tracking.authors['3800']?.deletionSuspectedAt).toBe(T0.toISOString())
        // 管理画面の概要は、記録の ID が今の設定と同じときだけ警告する
        expect(isLqngControlNotFound('1999', tracking.issues)).toBe(true)
        expect(isLqngControlNotFound('1998', tracking.issues)).toBe(false)
        let events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!.items
        expect(events.some((e) => e.kind === 'deletion_held')).toBe(false)
        expect(events.filter((e) => e.kind === 'control_not_found')).toHaveLength(1)
        expect(reportError).toHaveBeenCalledTimes(1)
        expect(reportError.mock.calls[0]?.[1]).toBe(LQNG_ISSUE_CONTROL_NOT_FOUND)
        // 対照の ID は履歴・監視に出さない
        expect(JSON.stringify(events)).not.toContain('1999')
        expect(String(reportError.mock.calls[0]?.[0])).not.toContain('1999')

        // 1 時間後の 2 回目の 404 も追跡中の候補で確かめて確定する。同じ問題なので履歴・監視には積み直さない（監視は 6 時間に 1 回）
        await runPoll(m.kv, deps({ fetchUserInfo: info, reportError }, new Date(T0.getTime() + 61 * 60_000)), 'poll')
        tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
        expect(tracking.authors['3800']?.status).toBe('deleted')
        events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!.items
        expect(events.filter((e) => e.kind === 'control_not_found')).toHaveLength(1)
        expect(reportError).toHaveBeenCalledTimes(1)
      })

      it('設定の対照を確かめられない（通信の失敗）ときも追跡中の候補で確かめ直す。失敗は「見つからない」にしない', async () => {
        const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: trackingWith([controlAuthor('1912', 50)]) })
        const info = vi.fn(async (id: string): Promise<UserInfo> => {
          if (id === '1999') throw new Error('network')
          return id === '1912' ? existing(50) : deleted
        })
        const reportError = vi.fn()
        await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3810))), fetchUserInfo: info, reportError }), 'poll')
        expect(info.mock.calls.map((c) => c[0])).toEqual(['3810', '1999', '1912'])
        const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
        expect(tracking.authors['3810']?.deletionSuspectedAt).toBe(T0.toISOString())
        expect(isLqngControlNotFound('1999', tracking.issues)).toBe(false)
        expect(reportError).not.toHaveBeenCalled()
      })

      it('追跡中にも候補が無ければ、その回の 404 は保留する（見つからないことは記録する）', async () => {
        const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
        const info = configuredGone()
        await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3820))), fetchUserInfo: info }), 'poll')
        expect(info.mock.calls.map((c) => c[0])).toEqual(['3820', '1999'])
        const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
        expect(tracking.authors['3820']?.deletionSuspectedAt ?? null).toBeNull()
        expect(isLqngControlNotFound('1999', tracking.issues)).toBe(true)
        expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.find((e) => e.kind === 'deletion_held')?.note).toContain('control_404')
      })

      it('設定の対照の存在を確かめられたら、見つからない警告を下ろす', async () => {
        const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: knownNotFound([]) })
        await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3830))), fetchUserInfo: goneExceptControl() }), 'poll')
        const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
        expect(tracking.authors['3830']?.deletionSuspectedAt).toBe(T0.toISOString())
        expect(isLqngControlNotFound('1999', tracking.issues)).toBe(false)
      })

      it('設定の対照が見つからないと分かっている間は、存在確認の予算に追跡中の候補で確かめ直す分も残す', async () => {
        // まだ存在を確かめていない追跡中の投稿者 6 人（全員 404）
        const unchecked = Array.from({ length: 6 }, (_, i): TrackedAuthor => ({ ...controlAuthor(String(3840 + i), 0), status: 'unknown', lastCheckedAt: null, followerCount: null }))
        const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: knownNotFound([controlAuthor('1912', 50), ...unchecked]) })
        const info = configuredGone()
        // 新着の取得で予算の大半を使った回（残り 6 回）
        const newVideos = vi.fn(async () => pages([], [], LIMITS.subrequestBudget - 6))
        const r = await runPoll(m.kv, deps({ fetchNewVideos: newVideos, fetchUserInfo: info }), 'poll')
        expect(r.subrequests).toBeLessThanOrEqual(LIMITS.subrequestBudget)
        expect(info.mock.calls.slice(-2).map((c) => c[0])).toEqual(['1999', '1912'])
        const suspected = Object.values(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors).filter((a) => a.deletionSuspectedAt === T0.toISOString())
        expect(suspected.length).toBeGreaterThan(0)
      })
    })

    it('追跡中から選ぶときは、連投している投稿者とフォロワーが followerMax 以下の投稿者を対照にしない', async () => {
      // 1910: フォロワーは多いが連投中（同じ波の荒らしかもしれない）、1911: フォロワー 5（followerMax 以下）
      const frequent: TrackedAuthor = {
        ...controlAuthor('1910', 9000),
        posts: [0, 1, 2].map((i) => ({ id: `sm${1910}${i}`, title: 't', at: new Date(T0.getTime() - (60 + i) * 60_000).toISOString(), tagDetails: [], ownerVisibility: 'visible' as const })),
      }
      const m = memoryKv({ [LQNG_KV_KEYS.config]: noControlConfig, [LQNG_KV_KEYS.tracking]: trackingWith([frequent, controlAuthor('1911', 5), controlAuthor('1912', 50)]) })
      const info = vi.fn(async (id: string): Promise<UserInfo> => (id === '1912' ? existing(50) : deleted))
      await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(1, 3600))), fetchUserInfo: info }), 'poll')
      expect(info.mock.calls.map((c) => c[0])).toEqual(['3600', '1912'])
      expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['3600']?.deletionSuspectedAt).toBe(T0.toISOString())
    })

    it('同じ回に存在の確認が取れていれば、対照を別に確かめない', async () => {
      const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
      const info = vi.fn(async (id: string): Promise<UserInfo> => (id === '3401' ? existing(7) : deleted))
      await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads(2, 3400))), fetchUserInfo: info }), 'poll')
      expect(info).toHaveBeenCalledTimes(2)
      expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['3400']?.deletionSuspectedAt).toBe(T0.toISOString())
    })
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
        unattributed: [],
        lastRun: null,
        recentRuns: [],
        issues: {},
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
      // 刈り込みは確認より前なので、再確認した回の終わりには追跡に残っていて、退会扱いが外れている
      const author = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']
      expect(author?.status).toBe('existing')
      expect(author?.deletedObservedAt).toBeNull()
      const verdict = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!.authors['1001']
      expect(verdict?.status).toBe('ng')
      expect(verdict?.reasons).toEqual(['A_C'])
      expect(verdict?.deletedObservedAt).toBeNull()
      expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'author_restored' && e.authorId === '1001')).toBe(true)
      // 追跡中の投稿はもう無いので、次の回に追跡から外れる（投稿者 NG は残る）
      await runPoll(m.kv, deps({ fetchUserInfo: info }, hours(7 * 24 + 2)), 'poll')
      expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']).toBeUndefined()
      expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)!.authors['1001']?.status).toBe('ng')
    })

    it('確認待ちの投稿者が多くても、7 日前に確かめた退会扱いの再確認は後回しにし続けない', async () => {
      const m = seeded()
      // 6 時間ごとの定期確認が上限（10 人）を超えて溜まっている
      const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
      const checkedAt = hours(7 * 24 - 7).toISOString()
      for (let i = 0; i < LIMITS.usersPerRun + 5; i++) {
        const id = String(1100 + i)
        tracking.authors[id] = { authorId: id, firstSeenAt: checkedAt, lastPostAt: hours(7 * 24 - 1).toISOString(), posts: [{ id: `sm${1100 + i}`, title: 't', at: hours(7 * 24 - 1).toISOString(), tagDetails: [], ownerVisibility: 'visible' }], status: 'existing', lastCheckedAt: checkedAt, followerCount: 100, nickname: 'n', visibility: 'visible', deletedObservedAt: null, deletionSuspectedAt: null }
      }
      m.store.set(LQNG_KV_KEYS.tracking, JSON.stringify(tracking))
      const info = vi.fn(async () => existing(5))
      await runPoll(m.kv, deps({ fetchUserInfo: info }, hours(7 * 24 + 1)), 'poll')
      expect(info).toHaveBeenCalledTimes(LIMITS.usersPerRun)
      expect(info).toHaveBeenCalledWith('1001')
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

  it('判定表は書けて追跡表の前で落ちた回の動画も、次の回に追跡と補完待ちへ戻して補完する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const failingTracking = { ...m.kv, put: async (key: string, value: string) => {
      if (key === LQNG_KV_KEYS.tracking) throw new Error('kv put failed')
      await m.kv.put(key, value)
    } }
    const uploads = [video({ id: 'sm97', title: 'て/す/と/ま/ん' }), video({ id: 'sm98', authorId: '1002', ownerVisibility: 'hidden' })]
    // この回は getthumbinfo が一時的に使えず、補完できないまま追跡表の保存で落ちる
    const noThumb = vi.fn(async (): Promise<ThumbResult> => ({ ok: false, reason: 'unavailable' }))
    await expect(runPoll(failingTracking, deps({ fetchNewVideos: vi.fn(async () => pages(uploads)), fetchThumbInfo: noThumb }), 'poll')).rejects.toThrow('kv put failed')
    // 判定表には残ったが、追跡表は書けていない
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.videos.sm98?.status).toBe('hold')
    expect(m.store.has(LQNG_KV_KEYS.tracking)).toBe(false)

    // 次の回は新着に出なくても、判定表の動画を追跡と補完待ちに戻して補完する（ロックタグ群で D）
    const thumb = vi.fn(async (id: string) => (id === 'sm98' ? okThumb(locked('g1', 'g2', 'g3')) : okThumb()))
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([])), fetchThumbInfo: thumb }, new Date(T0.getTime() + 15 * 60_000)), 'poll')
    expect(thumb.mock.calls.map((c) => c[0]).sort()).toEqual(['sm97', 'sm98'])
    const tracking = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!
    expect(tracking.authors['1001']?.posts.map((p) => p.id)).toEqual(['sm97'])
    expect(tracking.authors['1002']?.posts.map((p) => p.id)).toEqual(['sm98'])
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.videos.sm98?.reasons).toEqual(['D'])
  })

  it('既知かどうかは追跡だけで見る（判定だけある動画も新着に出れば追跡に入れる）', async () => {
    const old = new Date(T0.getTime() - 8 * 24 * 3600_000).toISOString() // 追跡期間（7 日）より前
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: config,
      [LQNG_KV_KEYS.verdicts]: { version: 1, authors: {}, videos: { sm99: { status: 'ng', reasons: ['B'], authorId: '1001', title: 't', registeredAt: old, since: old } }, updatedAt: old },
    })
    // 追跡期間より古い判定は戻さない
    await runPoll(m.kv, deps({}), 'poll')
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.authors['1001']).toBeUndefined()
    // 新着として出てきたら（重なり区間など）、判定があっても追跡に入れる
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm99', registeredAt: at(-1) })])) }, new Date(T0.getTime() + 15 * 60_000)), 'poll')
    expect(r.newVideos).toBe(1)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.authors['1001']?.posts.map((p) => p.id)).toEqual(['sm99'])
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
      unattributed: [],
      lastRun: null,
      recentRuns: [],
      issues: {},
      updatedAt: days(8),
    }
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: tracking })
    const info = goneExceptControl()
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
    // 試行回数（attempts）は増えず、一時的な失敗の回数だけを数える
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.pending).toEqual([{ id: 'sm500', authorId: '1001', attempts: 0, transient: 6 }])
  })

  it('確かな失敗（error）は試行回数に数え、上限で諦める', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const failing = vi.fn(async (): Promise<ThumbResult> => ({ ok: false, reason: 'error' }))
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm501' })])), fetchThumbInfo: failing }), 'poll')
    for (let i = 1; i < LIMITS.pendingMaxAttempts; i++) await runPoll(m.kv, deps({ fetchThumbInfo: failing }, later(i)), 'poll')
    expect(failing).toHaveBeenCalledTimes(LIMITS.pendingMaxAttempts)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.pending).toEqual([])
  })

  it('一時的に取れなかった動画は待ち行列の末尾に回し、次の回はほかの動画を先に補完する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const uploads = Array.from({ length: 5 }, (_, i) => video({ id: `sm${520 + i}`, authorId: String(5200 + i), registeredAt: at(-10 + i) }))
    // 1 回目: 先頭 3 本が一時的に失敗して打ち切り（残り 2 本は手を付けない）
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(uploads)), fetchThumbInfo: vi.fn(async () => unavailable) }), 'poll')
    const pending = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.pending
    expect(pending.map((p) => p.id)).toEqual(['sm523', 'sm524', 'sm520', 'sm521', 'sm522'])
    expect(pending.map((p) => p.transient ?? 0)).toEqual([0, 0, 1, 1, 1])
    // 2 回目: 手を付けていなかった動画から補完する
    const thumb = vi.fn(async (_id: string) => okThumb())
    await runPoll(m.kv, deps({ fetchThumbInfo: thumb }, later(1)), 'poll')
    expect(thumb.mock.calls.map((c) => c[0])).toEqual(['sm523', 'sm524', 'sm520', 'sm521', 'sm522'])
  })

  it('一時的な失敗が上限回数に達した動画は諦める', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm530' })])), fetchThumbInfo: vi.fn(async () => unavailable) }), 'poll')
    for (let i = 1; i < LIMITS.pendingMaxTransient; i++) await runPoll(m.kv, deps({ fetchThumbInfo: vi.fn(async () => unavailable) }, later(i)), 'poll')
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

describe('lqng-poller 外部呼び出しの予算', () => {
  it('新着取得は実際に送ったページ数だけ予算を使う', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([], [], 5)) }), 'poll')
    expect(r.subrequests).toBe(5)
  })

  it('本家ページが全部失敗した回も、送ったページ数を使ったうえで予備の分を足す', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => allFailed('nico_page_http_500')), fetchNewVideosFallback: vi.fn(async () => []) }), 'poll')
    expect(r.subrequests).toBe(4 + LIMITS.fallbackCost)
  })

  it('新着取得に使うタグは上限までにし、超えた分は注記する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: { ...config, pollTags: ['t1', 't2', 't3', 't4', 't5'] } })
    const fetchNew = vi.fn(async () => pages([]))
    const r = await runPoll(m.kv, deps({ fetchNewVideos: fetchNew }), 'poll')
    expect((fetchNew.mock.calls[0] as unknown as [string[], string])[0]).toEqual(['t1', 't2', 't3'])
    expect(r.note).toContain(`poll_tags_capped: 5>${LIMITS.pollTagsMax}`)
  })
})

describe('lqng-poller 退会扱いの投稿者の A∧C の付け直し', () => {
  const observedAt = new Date(T0.getTime() - 60 * 60_000).toISOString()
  const deletedAuthor = (posts: string[]): TrackedAuthor => ({
    authorId: '1001',
    firstSeenAt: observedAt,
    lastPostAt: posts[posts.length - 1] ?? observedAt,
    posts: posts.map((postAt, i) => ({ id: `sm${40 + i}`, title: 't', at: postAt, tagDetails: [], ownerVisibility: 'visible' })),
    status: 'deleted',
    lastCheckedAt: observedAt,
    followerCount: null,
    nickname: 'n',
    visibility: 'visible',
    deletedObservedAt: observedAt,
    deletionSuspectedAt: null,
  })
  const tracking = (author: TrackedAuthor): LqngTracking => ({
    version: 1,
    lastPollAt: observedAt,
    lastSweepDate: null,
    authors: { [author.authorId]: author },
    pending: [],
    unattributed: [],
    lastRun: null,
    recentRuns: [],
    issues: {},
    updatedAt: observedAt,
  })

  it('判定表から A∧C が消えていても（同時実行の上書きなど）、外部呼び出しなしで付け直す', async () => {
    const burst = [at(-180), at(-175), at(-170)]
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: tracking(deletedAuthor(burst)) })
    const info = vi.fn(async () => existing(5))
    await runPoll(m.kv, deps({ fetchUserInfo: info }), 'poll')
    expect(info).not.toHaveBeenCalled()
    const verdict = m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']
    expect(verdict?.reasons).toEqual(['A_C'])
    expect(verdict?.deletedObservedAt).toBe(observedAt)
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items.some((e) => e.kind === 'author_ng' && e.authorId === '1001')).toBe(true)
  })

  it('連投でない退会扱いの投稿者には付けない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: tracking(deletedAuthor([at(-600), at(-60)])) })
    await runPoll(m.kv, deps(), 'poll')
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
  })
})

describe('lqng-poller 判定表を壊さない', () => {
  it.each([
    ['形が違う', '{"version":1,"authors":"x","videos":{}}'],
    ['JSON でない', '{"authors":'],
  ])('判定表が読めない（%s）ときは上書きせず、追跡表も進めずにエラーを記録する', async (_label, raw) => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    m.store.set(LQNG_KV_KEYS.verdicts, raw)
    const reportError = vi.fn()
    const fetchNew = vi.fn(async () => pages([video({ id: 'sm600', title: 'て/す/と/ま/ん' })]))
    const r = await runPoll(m.kv, deps({ fetchNewVideos: fetchNew, reportError }), 'poll')
    expect(r.skipped).toBe('verdicts_unreadable')
    expect(fetchNew).not.toHaveBeenCalled()
    expect(m.store.get(LQNG_KV_KEYS.verdicts)).toBe(raw)
    expect(m.store.has(LQNG_KV_KEYS.tracking)).toBe(false)
    expect(m.puts).toEqual([LQNG_KV_KEYS.events])
    expect(m.read<LqngEvents>(LQNG_KV_KEYS.events)?.items[0]).toMatchObject({ kind: 'error', note: 'verdicts_unreadable' })
    expect(reportError).toHaveBeenCalledTimes(1)
    // 続く回は同じエラーを積み直さず（書き込みなし）、監視への報告も 6 時間に 1 回にする
    m.reset()
    await runPoll(m.kv, deps({ reportError }, new Date(T0.getTime() + 15 * 60_000)), 'poll')
    expect(m.puts).toEqual([])
    expect(reportError).toHaveBeenCalledTimes(1)
    await runPoll(m.kv, deps({ reportError }, new Date(T0.getTime() + 6 * 3600_000)), 'poll')
    expect(reportError).toHaveBeenCalledTimes(2)
    expect(m.puts).toEqual([LQNG_KV_KEYS.events])
  })

  it('投稿者 NG の数が読み込み時より減る書き込みは問題として返す', () => {
    const verdicts = (ids: string[]): LqngVerdicts => ({
      version: 1,
      authors: Object.fromEntries(ids.map((id) => [id, { status: 'ng' as const, reasons: ['B' as const], since: 's', evidence: [] }])),
      videos: {},
      updatedAt: 's',
    })
    const tracking = emptyTracking(T0.toISOString())
    const baseline = captureBaseline({ verdicts: verdicts(['1', '2']), tracking, events: emptyEvents() })
    expect(verdictsWriteProblem(baseline, verdicts(['1']))).toBe('verdicts_shrank: 2>1')
    expect(verdictsWriteProblem(baseline, verdicts(['1', '2']))).toBeNull()
    expect(verdictsWriteProblem(baseline, verdicts(['1', '2', '3']))).toBeNull()
  })
})

describe('lqng-poller 追跡期間より古い動画', () => {
  const days = (d: number): string => new Date(T0.getTime() - d * 24 * 3600_000).toISOString()
  const trackingAt = (lastPollAt: string, authors: TrackedAuthor[] = []): LqngTracking => ({
    version: 1,
    lastPollAt,
    lastSweepDate: null,
    authors: Object.fromEntries(authors.map((a) => [a.authorId, a])),
    pending: [],
    unattributed: [],
    lastRun: null,
    recentRuns: [],
    issues: {},
    updatedAt: lastPollAt,
  })

  it('最終取得時刻が止まっていても、取得範囲の起点は追跡期間（trackDays）より前にしない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: trackingAt(days(10)) })
    const fetchNew = vi.fn(async () => pages([]))
    await runPoll(m.kv, deps({ fetchNewVideos: fetchNew }), 'poll')
    expect((fetchNew.mock.calls[0] as unknown as [string[], string])[1]).toBe(days(7))
  })

  it('追跡期間より古い動画は取り込まない（新着に数えず、補完もしない）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const thumb = vi.fn(async (_id: string) => okThumb())
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages([video({ id: 'sm700', registeredAt: days(8) })])), fetchThumbInfo: thumb }), 'poll')
    expect(r.newVideos).toBe(0)
    expect(thumb).not.toHaveBeenCalled()
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.authors['1001']).toBeUndefined()
  })

  it('ショートが取れない状態が続いて古い連投が取得範囲に残っても、それで A∧C にしない', async () => {
    const suspectedAt = new Date(T0.getTime() - 2 * 3600_000).toISOString()
    const author: TrackedAuthor = {
      authorId: '1001',
      firstSeenAt: days(1),
      lastPostAt: days(1),
      posts: [{ id: 'sm710', title: 't', at: days(1), tagDetails: [], ownerVisibility: 'visible' }],
      status: 'existing',
      lastCheckedAt: suspectedAt,
      followerCount: 0,
      nickname: 'n',
      visibility: 'visible',
      deletedObservedAt: null,
      deletionSuspectedAt: suspectedAt,
    }
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config, [LQNG_KV_KEYS.tracking]: trackingAt(days(8.5), [author]) })
    // 8 日前の連投（追跡期間外）が、止まった取得範囲からまた返ってくる
    const oldBurst = [0, 5, 10].map((min, i) => video({ id: `sm${720 + i}`, registeredAt: new Date(new Date(days(8)).getTime() + min * 60_000).toISOString() }))
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => pages(oldBurst, [failed(0, 'tag_shorts')])), fetchUserInfo: goneExceptControl() }), 'poll')
    const tracked = m.read<LqngTracking>(LQNG_KV_KEYS.tracking)!.authors['1001']!
    expect(tracked.status).toBe('deleted')
    expect(tracked.posts.map((p) => p.id)).toEqual(['sm710'])
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
  })
})
