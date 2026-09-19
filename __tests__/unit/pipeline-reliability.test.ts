// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { gunzipSync } from 'node:zlib'
import {
  aggregateArtifacts,
  assertCounts,
  RANKING_GROUPS,
  type GroupArtifact,
} from '../../lib/pipeline/publication-contract'
import {
  publishRanking,
  type PublicationStore,
} from '../../lib/pipeline/publish-ranking'
import { retry, HttpFailure, mapLimit } from '../../lib/pipeline/retry'
import {
  CURRENT_KEY,
  currentGeneration,
  rankingKey,
  pipelineHealth,
} from '../../workers/utils/ranking-generation.js'
import { acquireLease } from '../../workers/utils/r2-lease.js'
import {
  dispatchRanking,
  scheduledSlot,
} from '../../workers/ranking-scheduler/scheduler.js'
import {
  rollbackGeneration,
  cleanupCandidates,
} from '../../lib/pipeline/generation-maintenance'
import { validateNGLists } from '../../lib/pipeline/ng-contract'

function artifacts(): GroupArtifact[] {
  return RANKING_GROUPS.map((genres, index) => ({
    version: 1,
    runId: '100',
    attempt: '1',
    slot: scheduledSlot(Date.now()),
    groupId: index + 1,
    collectedAt: new Date(Date.now() - 60_000).toISOString(),
    completedAt: new Date().toISOString(),
    results: genres.map((genre) => ({
      genre,
      data: Object.fromEntries(
        ['24h', 'hour'].map((period) => [
          period,
          {
            items: [{ id: 'sm1', tags: ['tag'] }],
            popularTags: ['tag'],
            tags: { tag: [{ id: 'sm1' }] },
          },
        ]),
      ),
    })),
  }))
}

function memoryStore() {
  const entries = new Map<string, { data: any; etag: string }>()
  let version = 0
  const store: PublicationStore = {
    read: vi.fn(async (key) => entries.get(key) || null),
    write: vi.fn(async (key, bytes, options) => {
      const old = entries.get(key)
      if (
        (options.ifNoneMatch && old) ||
        (options.ifMatch && old?.etag !== options.ifMatch)
      )
        throw new Error('CAS conflict')
      const raw = options.gzip ? gunzipSync(bytes) : bytes
      entries.set(key, {
        data: JSON.parse(Buffer.from(raw).toString()),
        etag: String(++version),
      })
    }),
  }
  return { store, entries }
}

function bucket() {
  const entries = new Map<string, { body: string; etag: string }>()
  let version = 0
  return {
    entries,
    get: vi.fn(async (key: string) => {
      const value = entries.get(key)
      return value
        ? { etag: value.etag, json: async () => JSON.parse(value.body) }
        : null
    }),
    put: vi.fn(async (key: string, body: string, options?: any) => {
      const existing = entries.get(key)
      if (
        (options?.onlyIf?.etagDoesNotMatch === '*' && existing) ||
        (options?.onlyIf?.etagMatches &&
          existing?.etag !== options.onlyIf.etagMatches)
      )
        return null
      const value = { body, etag: String(++version) }
      entries.set(key, value)
      return value
    }),
  }
}

afterEach(() => vi.restoreAllMocks())

describe('complete publication contract', () => {
  it('rejects unavailable or malformed NG policy instead of publishing unfiltered data', () => {
    expect(() => validateNGLists({}, [])).toThrow()
    expect(() =>
      validateNGLists(
        {
          videoIds: [],
          authorIds: [],
          videoTitles: { exact: [], partial: false },
          authorNames: [],
        },
        [],
      ),
    ).toThrow()
    expect(() =>
      validateNGLists(
        { videoIds: [], authorIds: [], videoTitles: [], authorNames: [] },
        [],
      ),
    ).not.toThrow()
  })
  it('aggregates all 8 groups and 46 genre/period pairs', () => {
    const result = aggregateArtifacts(artifacts(), '100')
    expect(Object.keys(result.publication.counts)).toHaveLength(46)
    expect(result.metadata.totalItems).toBe(46)
  })
  it.each([
    'missing',
    'duplicate',
    'foreign',
    'stale',
    'failed',
    'missing-tag',
    'wrong-genre',
    'invalid-date',
  ])('rejects %s before remote writes', (kind) => {
    const input = artifacts()
    if (kind === 'missing') input.pop()
    if (kind === 'duplicate') input[7] = input[0]
    if (kind === 'foreign') input[0].runId = '99'
    if (kind === 'stale')
      input[0].collectedAt = new Date(Date.now() - 121 * 60_000).toISOString()
    if (kind === 'failed') input[0].results[0].hadErrors = true
    if (kind === 'missing-tag') input[0].results[0].data.hour.tags = {}
    if (kind === 'wrong-genre') input[0].results[0].genre = 'anime'
    if (kind === 'invalid-date') input[0].completedAt = 'bad'
    expect(() => aggregateArtifacts(input, '100')).toThrow()
  })
  it('permits explicitly collected empty genres, but not an empty publication', () => {
    const input = artifacts()
    input[0].results[0].data.hour.items = []
    expect(() => aggregateArtifacts(input, '100')).not.toThrow()
    for (const artifact of input)
      for (const r of artifact.results)
        for (const p of ['hour', '24h']) r.data[p].items = []
    expect(() => aggregateArtifacts(input, '100')).toThrow('empty')
  })
  it('rejects drift at the affected genre rather than only total count', () => {
    expect(() =>
      assertCounts({ 'all/hour': 49 }, { 'all/hour': 100 }),
    ).toThrow()
    expect(() =>
      assertCounts({ 'all/hour': 50 }, { 'all/hour': 100 }),
    ).not.toThrow()
  })
})

describe('generation publication', () => {
  it('allows dots inside tag names but rejects traversal segments', () => {
    const manifest = {
      version: 1,
      generation: '1-1',
      collectedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      counts: { 'all/hour': 1 },
    }
    expect(rankingKey(manifest, 'rankings/all/hour/tags/a..b.json')).toContain(
      'a..b.json',
    )
    expect(() => rankingKey(manifest, 'rankings/../current.json')).toThrow(
      'Invalid ranking key',
    )
  })
  it('rejects a concurrent pointer change without overwriting the winner', async () => {
    const { store, entries } = memoryStore()
    const write = store.write
    store.write = async (key, ...args) => {
      if (key === CURRENT_KEY)
        entries.set(key, { data: { generation: 'winner' }, etag: 'winner' })
      return write(key, ...args)
    }
    await expect(
      publishRanking(store, aggregateArtifacts(artifacts(), '100')),
    ).rejects.toThrow('CAS')
    expect(entries.get(CURRENT_KEY)?.data.generation).toBe('winner')
  })

  it('previews rollback and validates retained objects before changing the pointer', async () => {
    const { store, entries } = memoryStore()
    const data = aggregateArtifacts(artifacts(), '100')
    await publishRanking(store, data)
    const next = structuredClone(data)
    next.publication.generation = '101-1'
    next.publication.collectedAt = new Date().toISOString()
    next.metadata.updatedAt = next.publication.collectedAt
    await publishRanking(store, next)
    expect((await rollbackGeneration(store, '100-1')).applied).toBe(false)
    expect(entries.get(CURRENT_KEY)?.data.generation).toBe('101-1')
    await rollbackGeneration(store, '100-1', true)
    expect(entries.get(CURRENT_KEY)?.data.generation).toBe('100-1')
    entries.delete('rankings/generations/101-1/all/hour/all.json')
    await expect(rollbackGeneration(store, '101-1', true)).rejects.toThrow(
      'incomplete',
    )
    expect(entries.get(CURRENT_KEY)?.data.generation).toBe('100-1')
  })

  it('protects current, previous, recently touched and unknown generations during cleanup', () => {
    const now = Date.now(),
      old = now - 8 * 86400_000
    const object = (id: string, modified = old) => ({
      key: `rankings/generations/${id}/all/hour/all.json`,
      modified,
    })
    expect(
      cleanupCandidates(
        [
          object('1-1'),
          object('2-1'),
          object('3-1'),
          object('4-1', now),
          object('5-1', NaN),
          { key: 'rankings/metadata.json', modified: old },
        ],
        { generation: '1-1', previousGeneration: '2-1' },
        now,
      ),
    ).toEqual([object('3-1').key])
  })
  it('writes gzip objects, verifies them, then commits one pointer; retry is idempotent', async () => {
    const { store, entries } = memoryStore()
    const data = aggregateArtifacts(artifacts(), '100')
    const manifest = await publishRanking(store, data)
    expect(entries.get(CURRENT_KEY)?.data).toEqual(manifest)
    expect(vi.mocked(store.write).mock.calls.at(-1)?.[0]).toBe(CURRENT_KEY)
    expect(entries.has('rankings/all/hour/all.json')).toBe(false)
    const calls = vi.mocked(store.write).mock.calls.length
    await publishRanking(store, data)
    expect(vi.mocked(store.write).mock.calls).toHaveLength(calls)
  })
  it('leaves the public pointer intact after a failed upload and resumes only missing objects', async () => {
    const { store, entries } = memoryStore()
    const data = aggregateArtifacts(artifacts(), '100')
    const write = store.write
    let fail = true
    store.write = vi.fn(
      async (...args: Parameters<PublicationStore['write']>) => {
        const [key] = args
        if (fail && key.endsWith('game/hour/all.json')) throw new Error('500')
        return write(...args)
      },
    )
    await expect(publishRanking(store, data)).rejects.toThrow('500')
    expect(entries.has(CURRENT_KEY)).toBe(false)
    const saved = entries.size
    fail = false
    vi.mocked(store.write).mockClear()
    await publishRanking(store, data)
    expect(vi.mocked(store.write).mock.calls.length).toBe(entries.size - saved)
  })
  it('rejects corrupted read-back before committing', async () => {
    const { store } = memoryStore()
    const read = store.read
    store.read = async (key) => {
      const result = await read(key)
      return result && key.endsWith('all/hour/all.json')
        ? { ...result, data: {} }
        : result
    }
    await expect(
      publishRanking(store, aggregateArtifacts(artifacts(), '100')),
    ).rejects.toThrow('Read-back')
    expect(await read(CURRENT_KEY)).toBe(null)
  })
  it('rejects a stale run and disabling generations after cutover', async () => {
    const { store } = memoryStore()
    const data = aggregateArtifacts(artifacts(), '100')
    await publishRanking(store, data)
    const older = structuredClone(data)
    older.publication.generation = '99-1'
    await expect(publishRanking(store, older)).rejects.toThrow('stale')
    await expect(publishRanking(store, data, false)).rejects.toThrow('Legacy')
  })
  it('does not treat corrupt manifests as legacy', async () => {
    const b = bucket()
    await b.put(CURRENT_KEY, '{}')
    await expect(currentGeneration(b)).rejects.toThrow('Invalid')
    expect(rankingKey(null, 'rankings/all/hour/all.json')).toBe(
      'rankings/all/hour/all.json',
    )
  })
})

describe('bounded retries', () => {
  it('retries transient 500/504/429 and stops on authentication failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpFailure(500))
      .mockRejectedValueOnce(new HttpFailure(504))
      .mockRejectedValueOnce(new HttpFailure(429))
      .mockResolvedValue(7)
    const sleep = vi.fn(async () => {})
    expect(await retry(fn, { sleep })).toBe(7)
    expect(sleep).toHaveBeenCalledTimes(3)
    const denied = vi.fn().mockRejectedValue(new HttpFailure(403))
    await expect(retry(denied, { sleep })).rejects.toThrow('403')
    expect(denied).toHaveBeenCalledTimes(1)
  })
  it('does not exceed retry budget or concurrency', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpFailure(429, 600_000))
    await expect(retry(fn, { sleep: async () => {} })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
    let active = 0,
      max = 0
    await mapLimit(Array.from({ length: 20 }), 3, async () => {
      max = Math.max(max, ++active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
    })
    expect(max).toBe(3)
  })
})

describe('scheduler and independent freshness', () => {
  it('computes the latest hourly slot across midnight', () => {
    expect(scheduledSlot(Date.parse('2026-09-20T00:10:00Z'))).toBe(
      '2026-09-19T23:20:00.000Z',
    )
  })
  it('leases exclude competing operations and cannot release another owner', async () => {
    const b = bucket()
    const lease = await acquireLease(b, 'lock', 120_000)
    expect(await acquireLease(b, 'lock', 120_000)).toBe(null)
    await b.put(
      'lock',
      JSON.stringify({ owner: 'other', expiresAt: Date.now() + 120_000 }),
    )
    await expect(lease!.assertOwned()).rejects.toThrow()
    await lease!.release()
    expect((await (await b.get('lock'))!.json()).owner).toBe('other')
  })
  it('does not redispatch after a lost HTTP response', async () => {
    const b = bucket()
    const github = vi.fn(async (_path: string, method?: string) => {
      if (method === 'POST') throw new Error('response lost')
      return { workflow_runs: [] }
    })
    const env = { R2_BUCKET: b, DISPATCH_ENABLED: 'true' }
    await expect(dispatchRanking(env, github)).rejects.toThrow('response lost')
    expect((await dispatchRanking(env, github)).state).toBe('awaiting-run')
    expect(github.mock.calls.filter((c) => c[1] === 'POST')).toHaveLength(1)
  })
  it('does not cancel or accumulate work while a collection is running', async () => {
    const github = vi.fn(async () => ({
      workflow_runs: [
        { id: 1, status: 'in_progress', created_at: new Date().toISOString() },
      ],
    }))
    expect(
      (
        await dispatchRanking(
          { R2_BUCKET: bucket(), DISPATCH_ENABLED: 'true' },
          github,
        )
      ).state,
    ).toBe('running')
    expect(github).toHaveBeenCalledTimes(1)
  })
  it('does not start in shadow mode', async () => {
    expect(
      (await dispatchRanking({ DISPATCH_ENABLED: 'false' }, null)).state,
    ).toBe('shadow')
  })
  it('caps dispatch attempts and retries failed jobs rather than recollecting successful groups', async () => {
    const b = bucket(),
      now = Date.now(),
      slot = scheduledSlot(now)
    const github = vi.fn(async (_path: string, method?: string) =>
      method === 'POST'
        ? null
        : {
            workflow_runs: [
              {
                id: 7,
                status: 'completed',
                conclusion: 'failure',
                display_title: `Ranking ${slot}`,
                created_at: new Date(now).toISOString(),
              },
            ],
          },
    )
    const env = { R2_BUCKET: b, DISPATCH_ENABLED: 'true' }
    expect((await dispatchRanking(env, github, now)).state).toBe('retrying')
    expect(github).toHaveBeenCalledWith(
      'actions/runs/7/rerun-failed-jobs',
      'POST',
    )
    await b.put(
      'pipeline/dispatch-state.json',
      JSON.stringify({ slot, attempts: 2, sentAt: now - 16 * 60_000 }),
    )
    await expect(dispatchRanking(env, github, now)).rejects.toThrow('exhausted')
  })
  it('detects stale rankings despite fresh stats, and identifies wrong generation', () => {
    const now = Date.now()
    const manifest = {
      generation: '1-1',
      publishedAt: new Date(now - 130 * 60_000).toISOString(),
    }
    const stats = {
      metadata: { updatedAt: new Date(now).toISOString(), totalVideos: 100 },
    }
    expect(
      pipelineHealth(manifest, stats, { generation: '2-1' }, now).problems,
    ).toEqual(['ranking-critical', 'stats-generation-mismatch'])
  })
})
