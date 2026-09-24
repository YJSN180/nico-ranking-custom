import { describe, it, expect, vi } from 'vitest'
import { BACKFILL_LIMITS, commitBackfill, createBackfillCursor, emptyDeltas, mergeDeltas, runBackfillStep, type BackfillDeps } from '@/workers/lqng-poller/src/backfill'
import { InvalidInboxRefError, normalizeDeltas } from '@/workers/lqng-poller/src/inbox'
import type { SnapshotVideo, ThumbResult, UserInfo } from '@/workers/lqng-poller/src/sources'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import type { LqngConfig } from '@/lib/lqng/types'
import { memoryKv } from './helpers/lqng-memory-kv'

// 合成データのみ。実在の ID・名前・タグは使わない

const config: Partial<LqngConfig> = {
  enabled: true,
  pollTags: ['tagA', 'tagB'],
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

const T0 = new Date('2026-02-01T12:00:00Z')
const at = (min: number): string => new Date(T0.getTime() - min * 60_000).toISOString()
const video = (over: Partial<SnapshotVideo>): SnapshotVideo => ({ id: 'sm1', title: '通常', authorId: '1001', registeredAt: at(1), ownerVisibility: null, tags: ['x'], ...over })
const burst = (authorId: string, n: number, over: Partial<SnapshotVideo> = {}): SnapshotVideo[] =>
  Array.from({ length: n }, (_, i) => video({ id: `${authorId}-${i}`, authorId, registeredAt: at(1 + i * 2), ...over }))
const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))
const existing = (followerCount: number): UserInfo => ({ status: 'existing', followerCount, nickname: 'n' })
const deleted: UserInfo = { status: 'deleted', followerCount: null, nickname: null }

/** 窓の境界を無視して、与えた一覧を新しい順に 100 件ずつ返す */
function pager(videos: SnapshotVideo[]) {
  return vi.fn(async (_tags: string[], _start: string, _end: string, offset: number) => ({ videos: videos.slice(offset, offset + 100), totalCount: videos.length }))
}

function deps(over: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    now: () => T0,
    fetchWindowPage: pager([]),
    fetchTagPage: vi.fn(async () => ({ items: [], totalCount: 0, hasNext: false })),
    fetchUserInfo: vi.fn(async () => existing(100)),
    fetchThumbInfo: vi.fn(async (): Promise<ThumbResult> => ({ ok: true, info: { tagDetails: locked('x'), ownerVisibility: 'visible', nickname: 'n' } })),
    ...over,
  }
}

describe('runBackfillStep', () => {
  it('設定が無効なら走査しない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: { ...config, enabled: false } })
    const r = await runBackfillStep(m.kv, deps(), null, { days: 1 })
    expect(r.skipped).toBe('disabled')
    expect(m.puts).toEqual([])
  })

  it('連投の投稿者は存在確認し、削除済みなら A∧C で投稿者 NG（根拠は 3 件まで）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const fetchUserInfo = vi.fn(async () => deleted)
    const d = deps({ fetchWindowPage: pager(burst('2001', 6)), fetchUserInfo })
    const r = await runBackfillStep(m.kv, d, null, { days: 1 })
    expect(r.skipped).toBeNull()
    expect(fetchUserInfo).toHaveBeenCalledTimes(1)
    expect(fetchUserInfo).toHaveBeenCalledWith('2001')
    expect(r.deltas.authors['2001']?.reasons).toEqual(['A_C'])
    expect(r.deltas.authors['2001']?.evidence).toHaveLength(BACKFILL_LIMITS.evidencePerAuthor)
    expect(r.deltas.authors['2001']?.deletedObservedAt).toBe(T0.toISOString())
    expect(Object.keys(r.deltas.videos)).toEqual([]) // 投稿者 NG に吸収される
    expect(r.done).toBe(true) // 1 日分の 1 窓だけなので走査完了
    expect(r.cursor.stats.videos).toBe(6)
    expect(m.puts).toEqual([]) // 走査は KV に書かない
  })

  it('連投でも現存なら A∧C にせず、存在確認の結果を持ち回る', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({ fetchWindowPage: pager(burst('2002', 6)) })
    const r = await runBackfillStep(m.kv, d, null, { days: 1 })
    expect(r.deltas.authors).toEqual({})
    expect(r.cursor.checked['2002']).toEqual({ status: 'existing', followerCount: 100, nickname: 'n' })
  })

  it('タイトル照合（B）は存在確認なしで投稿者 NG にする', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const fetchUserInfo = vi.fn(async () => existing(1))
    const d = deps({ fetchWindowPage: pager([video({ id: 'sm5', authorId: '2003', title: 'て/す/と/ま/ん 新作' })]), fetchUserInfo })
    const r = await runBackfillStep(m.kv, d, null, { days: 1 })
    expect(r.deltas.authors['2003']?.reasons).toEqual(['B'])
    expect(fetchUserInfo).not.toHaveBeenCalled()
  })

  it('キーワード ∧ 連投（HK）は取り込み時に投稿者 NG にする', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const d = deps({ fetchWindowPage: pager(burst('2004', 5, { title: 'ほもと見る何か' })) })
    const r = await runBackfillStep(m.kv, d, null, { days: 1 })
    expect(r.deltas.authors['2004']?.reasons).toContain('HK')
    expect(r.cursor.pendingUsers).toEqual([])
  })

  it('同じ秒に公開された別々の動画 3 本も連投として数える（キーワード ∧ 連投 = HK）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const sameSecond = ['a', 'b', 'c'].map((suffix) => video({ id: `sm2010${suffix === 'a' ? 1 : suffix === 'b' ? 2 : 3}`, authorId: '2010', title: 'ほもと見る何か', registeredAt: at(1) }))
    const r = await runBackfillStep(m.kv, deps({ fetchWindowPage: pager(sameSecond) }), null, { days: 1 })
    expect(r.deltas.authors['2010']?.reasons).toContain('HK')
  })

  it('古い形式（version 1）のカーソルは受け付けない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const legacy = { ...createBackfillCursor(T0, 1), version: 1 } as unknown as Parameters<typeof runBackfillStep>[2]
    const r = await runBackfillStep(m.kv, deps(), legacy, { days: 1 })
    expect(r.skipped).toBe('cursor_version')
  })

  it('連投 ∧ ロックタグ群（C∧D）は該当群のタグを持つ動画だけ補完して判定する', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const fetchThumbInfo = vi.fn(async (_id: string): Promise<ThumbResult> => ({ ok: true, info: { tagDetails: locked('g1', 'g2', 'g3'), ownerVisibility: 'visible', nickname: 'n' } }))
    const videos = [...burst('2005', 4, { tags: ['g1', 'g2', 'g3'] }), video({ id: 'plain', authorId: '2005', registeredAt: at(9), tags: ['g1'] })]
    const d = deps({ fetchWindowPage: pager(videos), fetchThumbInfo })
    const r = await runBackfillStep(m.kv, d, null, { days: 1 })
    // 3 本目以降が「連投」になり候補に入る。タグ群を 1 つしか持たない動画は候補にならない
    expect(fetchThumbInfo).toHaveBeenCalled()
    expect(vi.mocked(fetchThumbInfo).mock.calls.map((c) => c[0])).not.toContain('plain')
    // 現存でフォロワー 100 なので D 単独では昇格せず、C∧D（無条件）で投稿者 NG になる
    expect(r.deltas.authors['2005']?.reasons).toEqual(['C_D'])
  })

  it('許可リストの投稿者と既に NG の投稿者は走査で無視する', async () => {
    const m = memoryKv({
      [LQNG_KV_KEYS.config]: config,
      [LQNG_KV_KEYS.verdicts]: { version: 1, authors: { '2006': { status: 'ng', reasons: ['B'], since: 't', evidence: [] } }, videos: {}, updatedAt: 't' },
    })
    const fetchUserInfo = vi.fn(async () => deleted)
    const d = deps({ fetchWindowPage: pager([...burst('9001', 6), ...burst('2006', 6)]), fetchUserInfo })
    const r = await runBackfillStep(m.kv, d, null, { days: 1 })
    expect(r.deltas).toEqual(emptyDeltas())
    expect(fetchUserInfo).not.toHaveBeenCalled()
  })

  it('ページと窓を進め、走査が終わり待ち行列が空になるまで done にしない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const many = Array.from({ length: 250 }, (_, i) => video({ id: `v${i}`, authorId: `${5000 + i}`, registeredAt: at(i) }))
    const fetchWindowPage = pager(many)
    const d = deps({ fetchWindowPage })
    const first = await runBackfillStep(m.kv, d, null, { pages: 3, days: 60 })
    expect(vi.mocked(fetchWindowPage).mock.calls.map((c) => c[3])).toEqual([0, 100, 200])
    expect(first.done).toBe(false)
    expect(first.cursor.offset).toBe(0) // 3 ページ目が末尾（50 件）なので次の窓へ
    expect(first.cursor.windowEnd).toBe(first.cursor.windowStart < first.cursor.windowEnd ? first.cursor.windowEnd : first.cursor.windowEnd)
    const second = await runBackfillStep(m.kv, d, first.cursor, { pages: 3 })
    expect(second.cursor.stats.calls).toBe(2)
    expect(second.done).toBe(true)
  })

  it('カーソル生成: days 指定は下限を、未指定は既定の下限を使う', () => {
    const c1 = createBackfillCursor(T0, 10)
    expect(new Date(c1.floor).getTime()).toBe(T0.getTime() - 10 * 24 * 3600_000)
    expect(c1.windowStart).toBe(c1.floor)
    const c2 = createBackfillCursor(T0, null)
    expect(c2.floor).toBe(BACKFILL_LIMITS.floorDefault)
    expect(new Date(c2.windowStart).getTime()).toBe(T0.getTime() - BACKFILL_LIMITS.windowDays * 24 * 3600_000)
  })
})

describe('runBackfillStep（pages ソース: 本家タグページで直近を補完）', () => {
  const pageItem = (id: string, authorId: string, minutesAgo: number) => ({ id, title: `t-${id}`, registeredAt: at(minutesAgo), owner: { ownerType: 'user', id: authorId, name: 'n', visibility: 'visible' } })

  it('タグごとにページを進め、floor より古い動画で次のタグへ。連投＋退会済みは A∧C', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const fetchTagPage = vi.fn(async (tag: string, page: number, kind: string) => {
      if (kind === 'tag_shorts') return { items: [], totalCount: 0, hasNext: false }
      if (tag === 'tagA' && page === 1) return { items: Array.from({ length: 32 }, (_, i) => pageItem(`a${i}`, '6001', 1 + i)), totalCount: 100, hasNext: true }
      if (tag === 'tagA' && page === 2) return { items: [pageItem('a-old', '6002', 5 * 24 * 60)], totalCount: 100, hasNext: true } // floor（2 日）より古い
      return { items: [pageItem('a0', '6001', 1), pageItem('b1', '6003', 30)], totalCount: 2, hasNext: false } // tagB: a0 は重複
    })
    const fetchUserInfo = vi.fn(async (id: string) => (id === '6001' ? deleted : existing(50)))
    const d = deps({ fetchTagPage, fetchUserInfo })
    const r = await runBackfillStep(m.kv, d, null, { pages: 8, source: 'pages' })
    expect(r.cursor.source).toBe('pages')
    expect(vi.mocked(fetchTagPage).mock.calls.map((c) => `${c[0]}:${c[2]}:${c[1]}`)).toEqual(['tagA:tag:1', 'tagA:tag:2', 'tagA:tag_shorts:1', 'tagB:tag:1', 'tagB:tag_shorts:1'])
    expect(r.deltas.authors['6001']?.reasons).toEqual(['A_C'])
    expect(r.deltas.authors['6003']).toBeUndefined()
    expect(r.done).toBe(true)
    expect(r.cursor.stats.videos).toBe(34) // 32 + 2（floor より古い 1 件は数えない）
  })

  it('ページ送りは件数でなく hasNext で決める（32 件未満でも続きがあれば同じタグの次のページへ）', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const fetchTagPage = vi.fn(async (tag: string, page: number, kind: string) => {
      if (kind === 'tag_shorts' || tag !== 'tagA') return { items: [], totalCount: 0, hasNext: false }
      if (page === 1) return { items: Array.from({ length: 30 }, (_, i) => pageItem(`h${i}`, `${6100 + i}`, 1 + i)), totalCount: 100, hasNext: true }
      return { items: [pageItem('h-last', '6199', 40)], totalCount: 100, hasNext: false }
    })
    const r = await runBackfillStep(m.kv, deps({ fetchTagPage }), null, { pages: 8, source: 'pages' })
    expect(vi.mocked(fetchTagPage).mock.calls.map((c) => `${c[0]}:${c[2]}:${c[1]}`).slice(0, 2)).toEqual(['tagA:tag:1', 'tagA:tag:2'])
    expect(r.cursor.stats.videos).toBe(31)
  })

  it('pages ソースの既定の遡りは 2 日', () => {
    const c = createBackfillCursor(T0, null, 'pages')
    expect(new Date(c.floor).getTime()).toBe(T0.getTime() - 2 * 24 * 3600_000)
    expect(c.tagIndex).toBe(0)
  })
})

describe('mergeDeltas / commitBackfill', () => {
  const authorVerdict = (reasons: string[]) => ({ status: 'ng' as const, reasons: reasons as never, since: 's', evidence: [] })
  const videoVerdict = (authorId: string) => ({ status: 'ng' as const, reasons: ['D'] as never, authorId, title: 't', registeredAt: '2026-01-01T00:00:00.000Z', since: 's' })

  it('mergeDeltas は投稿者の理由を和集合にし、投稿者 NG の動画は落とす', () => {
    const into = emptyDeltas()
    mergeDeltas(into, { authors: { '1': authorVerdict(['B']) }, videos: { sm1: { status: 'ng', reasons: ['D'] as never, authorId: '2', title: 't', registeredAt: 'r', since: 's' } } })
    mergeDeltas(into, { authors: { '1': authorVerdict(['A_C']), '2': authorVerdict(['HK']) }, videos: { sm2: { status: 'ng', reasons: ['D'] as never, authorId: '2', title: 't', registeredAt: 'r', since: 's' } } })
    expect(into.authors['1']?.reasons).toEqual(['B', 'A_C'])
    expect(Object.keys(into.videos)).toEqual(['sm1']) // sm2 は投稿者 2 が NG なので不要
  })

  it('commit は判定表・履歴を書かず、受け箱の一意なキーに差分を 1 回だけ置く', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const deltas = { authors: { '3001': authorVerdict(['A_C']), '3003': authorVerdict(['B']) }, videos: { sm9: videoVerdict('3002') } }
    const r = await commitBackfill(m.kv, T0, deltas, { runId: 'gh-100-1', seq: 3 })
    expect(r).toEqual({ skipped: null, key: 'lqng:inbox:gh-100-1:000003', authors: 2, videos: 1, kvWrites: 1 })
    expect(m.puts).toEqual(['lqng:inbox:gh-100-1:000003'])
    expect(m.store.has(LQNG_KV_KEYS.verdicts)).toBe(false)
    expect(m.store.has(LQNG_KV_KEYS.events)).toBe(false)
    const item = m.read<{ runId: string; seq: number; at: string; deltas: { authors: Record<string, unknown> } }>('lqng:inbox:gh-100-1:000003')!
    expect(item.runId).toBe('gh-100-1')
    expect(item.seq).toBe(3)
    expect(item.at).toBe(T0.toISOString())
    expect(Object.keys(item.deltas.authors).sort()).toEqual(['3001', '3003'])

    // 同じ runId・連番の再送は同じキーを上書きするだけ（受け箱は増えない）
    await commitBackfill(m.kv, T0, deltas, { runId: 'gh-100-1', seq: 3 })
    expect(Array.from(m.store.keys()).filter((k) => k.startsWith('lqng:inbox:'))).toEqual(['lqng:inbox:gh-100-1:000003'])
  })

  it('空の差分は書かない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const r = await commitBackfill(m.kv, T0, emptyDeltas(), { runId: 'r1', seq: 1 })
    expect(r.skipped).toBe('empty')
    expect(r.kvWrites).toBe(0)
    expect(m.puts).toEqual([])
  })

  it('不正な runId・連番は受け付けない', async () => {
    const m = memoryKv({ [LQNG_KV_KEYS.config]: config })
    const deltas = { authors: { '1': authorVerdict(['B']) }, videos: {} }
    await expect(commitBackfill(m.kv, T0, deltas, { runId: 'a:b', seq: 1 })).rejects.toBeInstanceOf(InvalidInboxRefError)
    await expect(commitBackfill(m.kv, T0, deltas, { runId: 'ok', seq: -1 })).rejects.toBeInstanceOf(InvalidInboxRefError)
    await expect(commitBackfill(m.kv, T0, deltas, { runId: 'ok', seq: 1.5 })).rejects.toBeInstanceOf(InvalidInboxRefError)
    expect(m.puts).toEqual([])
  })

  it('normalizeDeltas は形の崩れた判定・不正な ID を落とす', () => {
    const d = normalizeDeltas({
      authors: {
        '1001': { status: 'ng', reasons: ['B', 'X'], since: 's', evidence: [{ videoId: 'sm1', title: 't', registeredAt: 'r', rules: ['B'] }, { bad: true }] },
        'channel/ch7': { status: 'ng', reasons: ['A_C'], since: 's', evidence: [] },
        constructor: { status: 'ng', reasons: ['B'], since: 's', evidence: [] },
        '1002': { status: 'ng', reasons: [], since: 's', evidence: [] },
        '1003': { status: 'hold', reasons: ['B'], since: 's', evidence: [] },
      },
      videos: {
        sm5: { status: 'ng', reasons: ['D'], authorId: '1001', title: 't', registeredAt: 'r', since: 's' },
        so6: { status: 'ng', reasons: ['B'], authorId: null, title: 't', registeredAt: 'r', since: 's' },
        'x/1': { status: 'ng', reasons: ['D'], authorId: null, title: 't', registeredAt: 'r', since: 's' },
        sm7: { status: 'hold', reasons: [], authorId: null, title: 't', registeredAt: 'r', since: 's' },
      },
    })
    expect(Object.keys(d.authors).sort()).toEqual(['1001', 'channel/ch7'])
    expect(d.authors['1001']?.reasons).toEqual(['B'])
    expect(d.authors['1001']?.evidence).toEqual([{ videoId: 'sm1', title: 't', registeredAt: 'r', rules: ['B'] }])
    expect(Object.keys(d.videos).sort()).toEqual(['sm5', 'so6'])
    expect(normalizeDeltas(null)).toEqual(emptyDeltas())
  })
})
