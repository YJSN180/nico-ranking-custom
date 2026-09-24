import { describe, it, expect, vi } from 'vitest'
import { runPoll, LIMITS } from '@/workers/lqng-poller/src/poll'
import { commitBackfill } from '@/workers/lqng-poller/src/backfill'
import { AccessLimitedError, type PollDeps, type SourceVideo, type ThumbResult, type UserInfo } from '@/workers/lqng-poller/src/sources'
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
    const d = deps({ fetchNewVideos: vi.fn(async () => [...normal, ...burst]), fetchUserInfo, fetchThumbInfo })
    const r = await runPoll(m.kv, d, 'poll')
    expect(r.skipped).toBeNull()
    // 存在確認は 1 回 10 人まで。連投者 4000 が先頭に来る
    expect(vi.mocked(fetchUserInfo).mock.calls[0]?.[0]).toBe('4000')
    // 補完も連投者の動画から始まる
    expect(vi.mocked(fetchThumbInfo).mock.calls.slice(0, 4).map((c) => c[0])).toEqual(['b0', 'b1', 'b2', 'b3'])
    // 削除済み ∧ 連投 → 同じ実行内で投稿者 NG
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
    await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => [video({ id: 'sm80', title: 'て/す/と/ま/ん' })]) }), 'poll')
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
    const r = await runPoll(m.kv, deps({ fetchNewVideos: vi.fn(async () => [video({ id: 'sm81', title: 'て/す/と/ま/ん' })]) }), 'poll')
    expect([...m.puts].sort()).toEqual([LQNG_KV_KEYS.events, LQNG_KV_KEYS.tracking, LQNG_KV_KEYS.verdicts].sort())
    expect(r.kvWrites).toBe(3)
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastRun?.kvWrites).toBe(3)
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.updatedAt).toBe(T0.toISOString())
    const events = m.read<LqngEvents>(LQNG_KV_KEYS.events)!
    expect(events.items.some((e) => e.kind === 'poll')).toBe(false)
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
    expect(events.items.map((e) => e.kind)).toEqual(expect.arrayContaining(['video_ng', 'author_ng']))
    expect(m.read<LqngTracking>(LQNG_KV_KEYS.tracking)?.lastRun?.newVideos).toBe(1)
    // 書き込みは tracking / verdicts / events の 3 キー
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
    // 判定が変わらなければ判定表は書かれない
    expect(m.read<LqngVerdicts>(LQNG_KV_KEYS.verdicts)?.authors['1001']).toBeUndefined()
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
    const fetchNew = vi.fn(async () => [video({ id: 'sm60' })])
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
