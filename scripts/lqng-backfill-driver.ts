#!/usr/bin/env npx tsx
// 粗悪コンテンツ自動NG: 過去分バックフィルの駆動スクリプト
// Worker（lqng-poller）の /trigger?mode=backfill を繰り返し呼んで全履歴を走査し、判定差分を
// /trigger?mode=backfill-commit で受け箱（KV lqng:inbox:<runId>:<seq>）に置く。
// 判定表への反映は次のポーリング（15 分ごと）が受け箱を冪等に合流して行う。
// 実行元は .github/workflows/lqng-backfill.yml（WORKER_AUTH_KEY は Secrets）。
// 公開リポジトリの Actions ログに出るため、ID・名前・タイトルは出力しない（件数のみ）。
import { pathToFileURL } from 'node:url'
import { createBackfillCursor, emptyDeltas, mergeDeltas, type BackfillCommitResult, type BackfillCursor, type BackfillDeltas, type BackfillStepResult } from '../workers/lqng-poller/src/backfill'

export interface BackfillDriverOptions {
  pages: number
  maxCalls: number
  commitEvery: number
  sleepMs: number
  source: 'snapshot' | 'pages'
  days: number | null
  /** 走査の開始時点（この時刻より前を新しい順に走査）。null で現在 */
  endAt: Date | null
  /** 受け箱のキーに使う実行 ID（英数字・_・-、64 文字まで） */
  runId: string
}

export interface BackfillDriverIo {
  call: <T>(mode: 'backfill' | 'backfill-commit', body: unknown) => Promise<T>
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

export interface BackfillDriverResult {
  done: boolean
  calls: number
  /** この実行で見つけた投稿者 NG（重複を除く） */
  authorsNg: number
  /** この実行で見つけた動画 NG（重複と、投稿者 NG に含まれるものを除く） */
  videosNg: number
  /** 受け箱に置いた回数 */
  commits: number
  cursor: BackfillCursor | null
}

/** 走査が見つけた判定を重複なく数える（Worker の統計は呼び出しごとの検出数で、同じ投稿者を何度も数えうる） */
class FoundCounter {
  private readonly authors = new Set<string>()
  private readonly videos = new Map<string, string | null>()

  add(deltas: BackfillDeltas): void {
    for (const id of Object.keys(deltas.authors)) this.authors.add(id)
    for (const [id, v] of Object.entries(deltas.videos)) if (!this.videos.has(id)) this.videos.set(id, v.authorId)
  }

  get authorsNg(): number {
    return this.authors.size
  }

  get videosNg(): number {
    let n = 0
    for (const authorId of this.videos.values()) if (authorId === null || !this.authors.has(authorId)) n++
    return n
  }
}

const countOf = (deltas: BackfillDeltas): { authors: number; videos: number } => ({ authors: Object.keys(deltas.authors).length, videos: Object.keys(deltas.videos).length })

/**
 * 確定の応答。旧い Worker（ロック方式の確定）は authorsAdded / videosAdded を返し、
 * ポーリングとロックが重なると skipped: 'locked' を返す
 */
type CommitResponse = Pick<BackfillCommitResult, 'skipped'> & Partial<Pick<BackfillCommitResult, 'authors' | 'videos'>> & { authorsAdded?: number; videosAdded?: number }

/** 旧い Worker がロック中と答えたときに送り直す回数（間は 5 秒ずつ延ばす） */
const COMMIT_LOCKED_RETRIES = 6
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export async function runBackfillDriver(options: BackfillDriverOptions, io: BackfillDriverIo): Promise<BackfillDriverResult> {
  const found = new FoundCounter()
  let cursor: BackfillCursor | null = options.endAt ? createBackfillCursor(options.endAt, options.days, options.source) : null
  let pending = emptyDeltas()
  let sinceCommit = 0
  let seq = 0
  let commits = 0
  let done = false
  let calls = 0

  // 未確定の差分を受け箱に置く。失敗したら連番を進めず、次の試行で同じキーに置き直す
  const commitPending = async (): Promise<void> => {
    const { authors, videos } = countOf(pending)
    if (authors === 0 && videos === 0) return
    const body = { runId: options.runId, seq: seq + 1, deltas: pending }
    let r = await io.call<CommitResponse>('backfill-commit', body)
    // 旧い Worker（ロック方式の確定）がポーリングと重なった: 少し待って同じ連番で送り直す
    for (let attempt = 1; r.skipped === 'locked' && attempt <= COMMIT_LOCKED_RETRIES; attempt++) {
      await io.sleep(5_000 * attempt)
      r = await io.call<CommitResponse>('backfill-commit', body)
    }
    if (r.skipped === 'locked') {
      throw new Error('commit skipped: locked. The Worker still uses the old lock-based commit and stayed locked; deploy the current lqng-poller before re-running the backfill')
    }
    if (r.skipped && r.skipped !== 'empty') throw new Error(`commit skipped: ${r.skipped}`)
    seq++
    commits++
    pending = emptyDeltas()
    sinceCommit = 0
    io.log(`commit #${seq}: queued authors ${r.authors ?? r.authorsAdded ?? '?'} videos ${r.videos ?? r.videosAdded ?? '?'} (sent ${authors}/${videos}; merged into the verdict table by the next poll)`)
  }

  io.log(
    `backfill start: source=${options.source} pages=${options.pages} maxCalls=${options.maxCalls} days=${options.days ?? (options.source === 'pages' ? '2' : 'all')}` +
      ` end=${options.endAt ? options.endAt.toISOString() : 'now'} commitEvery=${options.commitEvery} runId=${options.runId}`
  )
  let scanFailed = false
  try {
    while (calls < options.maxCalls) {
      const r = await io.call<BackfillStepResult>('backfill', { cursor, pages: options.pages, days: options.days, source: options.source })
      if (r.skipped) throw new Error(`backfill skipped: ${r.skipped}`)
      calls++
      cursor = r.cursor
      mergeDeltas(pending, r.deltas)
      found.add(r.deltas)
      sinceCommit++
      const s = cursor.stats
      io.log(
        `#${calls} window ${cursor.windowStart.slice(0, 10)}..${cursor.windowEnd.slice(0, 10)} offset ${cursor.offset}` +
          ` | pages ${s.pages} videos ${s.videos} users ${s.usersChecked} thumbs ${s.thumbs}` +
          ` | ng authors ${found.authorsNg} videos ${found.videosNg}` +
          ` | pending users ${cursor.pendingUsers.length} thumbs ${cursor.pendingThumbs.length} | subrequests ${r.subrequests}` +
          (r.note ? ` | note: ${r.note}` : '')
      )
      if (r.done) {
        done = true
        break
      }
      if (sinceCommit >= options.commitEvery) await commitPending()
      // アクセス制限や退会判定の保留（ユーザー情報 API の異常の疑い）を検知したら十分に間を空ける
      await io.sleep(r.note?.includes('access limited') || r.note?.includes('deletion_held') ? 60_000 : options.sleepMs)
    }
  } catch (error) {
    scanFailed = true
    throw error
  } finally {
    // 途中で失敗しても、それまでに見つけた差分は確定してから終わる
    try {
      await commitPending()
    } catch (commitError) {
      if (!scanFailed) throw commitError
      io.log(`final commit failed after an earlier error: ${messageOf(commitError)}`)
    }
  }
  return { done, calls, authorsNg: found.authorsNg, videosNg: found.videosNg, commits, cursor }
}

const intEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]
  const n = raw ? Number(raw) : Number.NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function readOptions(): BackfillDriverOptions {
  const sourceRaw = process.env.BACKFILL_SOURCE?.trim()
  const daysRaw = process.env.BACKFILL_DAYS?.trim()
  const days = daysRaw ? Number(daysRaw) : null
  if (daysRaw && !(days !== null && Number.isFinite(days) && days > 0)) throw new Error('BACKFILL_DAYS must be a positive number')
  // 走査の開始時点（この時刻より前を新しい順に走査）。途中終了した続きを再開するときに使う
  const endRaw = process.env.BACKFILL_END?.trim()
  const endAt = endRaw ? new Date(endRaw) : null
  if (endRaw && !(endAt && Number.isFinite(endAt.getTime()))) throw new Error('BACKFILL_END must be an ISO date')
  const runId = process.env.LQNG_BACKFILL_RUN_ID?.trim() || `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) throw new Error('LQNG_BACKFILL_RUN_ID must be 1-64 characters of A-Z, a-z, 0-9, _ or -')
  return {
    pages: intEnv('BACKFILL_PAGES', 3),
    maxCalls: intEnv('BACKFILL_MAX_CALLS', 800),
    commitEvery: intEnv('BACKFILL_COMMIT_EVERY', 40),
    sleepMs: intEnv('BACKFILL_SLEEP_MS', 300),
    source: sourceRaw === 'pages' ? 'pages' : 'snapshot',
    days,
    endAt,
    runId,
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function createHttpCall(base: string, key: string): BackfillDriverIo['call'] {
  return async <T>(mode: 'backfill' | 'backfill-commit', body: unknown): Promise<T> => {
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
        if (res.status === 400) throw new Error(`${mode}: HTTP 400 ${await res.text()}`)
        if (res.ok) return (await res.json()) as T
        lastError = new Error(`${mode}: HTTP ${res.status}`)
      } catch (error) {
        if (error instanceof Error && (error.message.startsWith('unauthorized') || error.message.includes('HTTP 400'))) throw error
        lastError = error
      }
      await sleep(2_000 * attempt)
    }
    throw lastError instanceof Error ? lastError : new Error(`${mode}: failed`)
  }
}

async function main(): Promise<void> {
  const base = (process.env.LQNG_WORKER_URL ?? 'https://lqng-poller.yjsn180180.workers.dev').replace(/\/+$/, '')
  const key = process.env.WORKER_AUTH_KEY
  if (!key) throw new Error('WORKER_AUTH_KEY is required')
  const log = (line: string): void => {
    process.stdout.write(`${line}\n`)
  }
  const r = await runBackfillDriver(readOptions(), { call: createHttpCall(base, key), sleep, log })
  const stats = r.cursor ? { ...r.cursor.stats, authorsNg: r.authorsNg, videosNg: r.videosNg } : null
  log(JSON.stringify({ stage: 'backfill', done: r.done, calls: r.calls, commits: r.commits, stats }))
  if (!r.done) {
    log('backfill not finished (max calls reached). Re-run to continue from scratch; already queued verdicts are kept.')
    process.exitCode = 2
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().catch((error) => {
    console.error(messageOf(error))
    process.exitCode = 1
  })
}
