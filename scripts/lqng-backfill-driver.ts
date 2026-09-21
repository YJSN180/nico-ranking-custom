#!/usr/bin/env npx tsx
// 粗悪コンテンツ自動NG: 過去分バックフィルの駆動スクリプト
// Worker（lqng-poller）の /trigger?mode=backfill を繰り返し呼んで全履歴を走査し、
// 判定差分をまとめて /trigger?mode=backfill-commit で KV に書き込む。
// 実行元は .github/workflows/lqng-backfill.yml（WORKER_AUTH_KEY は Secrets）。
// 公開リポジトリの Actions ログに出るため、ID・名前・タイトルは出力しない（件数のみ）。
import { createBackfillCursor, emptyDeltas, mergeDeltas, type BackfillCommitResult, type BackfillCursor, type BackfillDeltas, type BackfillStepResult } from '../workers/lqng-poller/src/backfill'

const base = (process.env.LQNG_WORKER_URL ?? 'https://lqng-poller.yjsn180180.workers.dev').replace(/\/+$/, '')
const key = process.env.WORKER_AUTH_KEY
if (!key) throw new Error('WORKER_AUTH_KEY is required')

const intEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]
  const n = raw ? Number(raw) : Number.NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
const pages = intEnv('BACKFILL_PAGES', 3)
const maxCalls = intEnv('BACKFILL_MAX_CALLS', 800)
const commitEvery = intEnv('BACKFILL_COMMIT_EVERY', 40)
const sleepMs = intEnv('BACKFILL_SLEEP_MS', 300)
const daysRaw = process.env.BACKFILL_DAYS?.trim()
const days = daysRaw ? Number(daysRaw) : null
if (daysRaw && !(Number.isFinite(days) && (days as number) > 0)) throw new Error('BACKFILL_DAYS must be a positive number')

// 走査の開始時点（この時刻より前を新しい順に走査）。途中終了した続きを再開するときに使う
const endRaw = process.env.BACKFILL_END?.trim()
const endAt = endRaw ? new Date(endRaw) : null
if (endRaw && !(endAt && Number.isFinite(endAt.getTime()))) throw new Error('BACKFILL_END must be an ISO date')

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function call<T>(mode: 'backfill' | 'backfill-commit', body: unknown): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${base}/trigger?mode=${mode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      })
      if (res.status === 401) throw new Error('unauthorized (WORKER_AUTH_KEY mismatch)')
      if (res.ok) return (await res.json()) as T
      lastError = new Error(`${mode}: HTTP ${res.status}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('unauthorized')) throw error
      lastError = error
    }
    await sleep(2_000 * attempt)
  }
  throw lastError instanceof Error ? lastError : new Error(`${mode}: failed`)
}

async function commit(deltas: BackfillDeltas): Promise<void> {
  const authors = Object.keys(deltas.authors).length
  const videos = Object.keys(deltas.videos).length
  if (authors === 0 && videos === 0) return
  for (let attempt = 1; attempt <= 8; attempt++) {
    const r = await call<BackfillCommitResult>('backfill-commit', { deltas })
    if (r.skipped === 'locked') {
      await sleep(5_000)
      continue
    }
    if (r.skipped) throw new Error(`commit skipped: ${r.skipped}`)
    console.log(`commit: authors +${r.authorsAdded} videos +${r.videosAdded} (sent ${authors}/${videos}) kvWrites ${r.kvWrites}`)
    return
  }
  throw new Error('commit: lock busy')
}

async function main(): Promise<void> {
  let cursor: BackfillCursor | null = endAt ? createBackfillCursor(endAt, days) : null
  let pending = emptyDeltas()
  let sinceCommit = 0
  let done = false
  let calls = 0
  console.log(`backfill start: pages=${pages} maxCalls=${maxCalls} days=${days ?? 'all'} end=${endAt ? endAt.toISOString() : 'now'} commitEvery=${commitEvery}`)
  while (calls < maxCalls) {
    const r = await call<BackfillStepResult>('backfill', { cursor, pages, days })
    if (r.skipped === 'locked') {
      await sleep(5_000)
      continue
    }
    if (r.skipped) throw new Error(`backfill skipped: ${r.skipped}`)
    calls++
    cursor = r.cursor
    mergeDeltas(pending, r.deltas)
    sinceCommit++
    const s = cursor.stats
    console.log(
      `#${calls} window ${cursor.windowStart.slice(0, 10)}..${cursor.windowEnd.slice(0, 10)} offset ${cursor.offset}` +
        ` | pages ${s.pages} videos ${s.videos} users ${s.usersChecked} thumbs ${s.thumbs}` +
        ` | ng authors ${s.authorsNg} videos ${s.videosNg}` +
        ` | pending users ${cursor.pendingUsers.length} thumbs ${cursor.pendingThumbs.length} | subrequests ${r.subrequests}` +
        (r.note ? ` | note: ${r.note}` : '')
    )
    if (r.done) {
      done = true
      break
    }
    if (sinceCommit >= commitEvery) {
      await commit(pending)
      pending = emptyDeltas()
      sinceCommit = 0
    }
    // アクセス制限を検知したら十分に間を空ける
    await sleep(r.note?.includes('access limited') ? 60_000 : sleepMs)
  }
  await commit(pending)
  console.log(JSON.stringify({ stage: 'backfill', done, calls, stats: cursor?.stats ?? null }))
  if (!done) {
    console.log('backfill not finished (max calls reached). Re-run to continue from scratch; already committed verdicts are kept.')
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
