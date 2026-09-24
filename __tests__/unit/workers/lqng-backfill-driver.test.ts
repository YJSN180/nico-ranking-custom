// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { runBackfillDriver, type BackfillDriverIo, type BackfillDriverOptions } from '@/scripts/lqng-backfill-driver'
import { createBackfillCursor, emptyDeltas, type BackfillDeltas, type BackfillStepResult } from '@/workers/lqng-poller/src/backfill'

// 合成データのみ。実在の ID・名前・タグは使わない

const T0 = new Date('2026-02-01T12:00:00Z')

const options: BackfillDriverOptions = { pages: 3, maxCalls: 10, commitEvery: 40, sleepMs: 0, source: 'snapshot', days: 1, endAt: null, runId: 'gh-1-1' }

const authorVerdict = (reasons: string[]) => ({ status: 'ng' as const, reasons: reasons as never, since: 's', evidence: [] })
const videoVerdict = (authorId: string) => ({ status: 'ng' as const, reasons: ['D'] as never, authorId, title: 't', registeredAt: 'r', since: 's' })

/** 走査の応答を順に返す。Worker の統計（authorsNg / videosNg）は呼び出しごとの検出数を足していく */
function scripted(steps: Array<BackfillDeltas | Error>, done = true) {
  const cursor = createBackfillCursor(T0, 1)
  const commits: Array<{ runId: string; seq: number; deltas: BackfillDeltas }> = []
  let i = 0
  const call = vi.fn(async (mode: string, body: unknown): Promise<unknown> => {
    if (mode === 'backfill-commit') {
      const b = body as { runId: string; seq: number; deltas: BackfillDeltas }
      commits.push(b)
      return { skipped: null, key: `lqng:inbox:${b.runId}:${b.seq}`, authors: Object.keys(b.deltas.authors).length, videos: Object.keys(b.deltas.videos).length, kvWrites: 1 }
    }
    const step = steps[i++]
    if (!step) throw new Error('no more steps')
    if (step instanceof Error) throw step
    cursor.stats.calls++
    cursor.stats.authorsNg += Object.keys(step.authors).length
    cursor.stats.videosNg += Object.keys(step.videos).length
    const result: BackfillStepResult = { skipped: null, cursor: structuredClone(cursor), done: done && i === steps.length, deltas: step, subrequests: 1 }
    return result
  })
  const io: BackfillDriverIo = { call: call as unknown as BackfillDriverIo['call'], sleep: async () => {}, log: () => {} }
  return { io, call, commits }
}

describe('runBackfillDriver', () => {
  it('走査が途中で失敗しても、それまでの判定差分を確定してから失敗で終わる', async () => {
    const { io, commits } = scripted([{ authors: { '5001': authorVerdict(['A_C']) }, videos: {} }, new Error('backfill: HTTP 500')])
    await expect(runBackfillDriver(options, io)).rejects.toThrow('backfill: HTTP 500')
    expect(commits).toHaveLength(1)
    expect(commits[0]?.runId).toBe('gh-1-1')
    expect(commits[0]?.seq).toBe(1)
    expect(Object.keys(commits[0]?.deltas.authors ?? {})).toEqual(['5001'])
  })

  it('統計は同じ投稿者・動画を二重に数えず、投稿者 NG に含まれる動画も数えない', async () => {
    const { io } = scripted([
      { authors: { '5101': authorVerdict(['B']) }, videos: { sm1: videoVerdict('5102') } },
      // 別の呼び出しで同じ投稿者・同じ動画をもう一度検出し、5102 も投稿者 NG になる
      { authors: { '5101': authorVerdict(['HK']), '5102': authorVerdict(['A_C']) }, videos: { sm1: videoVerdict('5102'), sm2: videoVerdict('5103') } },
    ])
    const r = await runBackfillDriver(options, io)
    expect(r.done).toBe(true)
    expect(r.calls).toBe(2)
    expect(r.authorsNg).toBe(2)
    expect(r.videosNg).toBe(1) // sm1 は投稿者 5102 の NG に含まれるので sm2 だけ
    expect(r.commits).toBe(1)
  })

  it('何も見つからなければ確定しない', async () => {
    const { io, commits } = scripted([emptyDeltas()])
    const r = await runBackfillDriver(options, io)
    expect(r.done).toBe(true)
    expect(commits).toEqual([])
  })

  it('途中の確定は連番を進め、確定に失敗した差分は同じ連番で送り直す', async () => {
    const { io, call, commits } = scripted(
      [
        { authors: { '5201': authorVerdict(['B']) }, videos: {} },
        { authors: { '5202': authorVerdict(['B']) }, videos: {} },
        { authors: { '5203': authorVerdict(['B']) }, videos: {} },
      ],
      false
    )
    let failOnce = true
    const wrapped: BackfillDriverIo = {
      ...io,
      call: (async (mode: string, body: unknown) => {
        if (mode === 'backfill-commit' && (body as { seq: number }).seq === 2 && failOnce) {
          failOnce = false
          throw new Error('backfill-commit: HTTP 502')
        }
        return call(mode, body)
      }) as BackfillDriverIo['call'],
    }
    await expect(runBackfillDriver({ ...options, commitEvery: 1, maxCalls: 3 }, wrapped)).rejects.toThrow('backfill-commit: HTTP 502')
    expect(commits.map((c) => c.seq)).toEqual([1, 2])
    expect(Object.keys(commits[1]?.deltas.authors ?? {})).toEqual(['5202'])
  })
})
