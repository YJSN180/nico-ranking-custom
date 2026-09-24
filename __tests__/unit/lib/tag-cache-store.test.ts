// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { gzipSync } from 'node:zlib'
import {
  closeTagCacheR2Client,
  mergeTagCacheShard,
  pickTagCacheEntry,
  type TagCacheEntry,
  readTagCacheShard,
  readTagCacheShardFromR2,
  writeTagCacheShardToR2,
} from '@/lib/tag-cache-store'
import { kv } from '@/lib/simple-kv'

afterEach(() => {
  closeTagCacheR2Client()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function stubR2Credentials(): void {
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) vi.stubEnv(key, 'test-placeholder')
}

function gzippedShardBody() {
  return { transformToByteArray: async () => gzipSync(JSON.stringify({ sm1: success(new Date().toISOString()) })) }
}

function s3Failure(name: string, status: number): Error {
  return Object.assign(new Error(`${name} placeholder`), { name, $metadata: { httpStatusCode: status } })
}

describe('R2 shard reads', () => {
  it('reuses one bounded R2 client that does not wrap bodies in checksum streams', async () => {
    stubR2Credentials()
    const signals: unknown[] = []
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (_command: unknown, options?: { abortSignal?: unknown }) => {
      signals.push(options?.abortSignal)
      return { Body: gzippedShardBody() }
    })
    const destroy = vi.spyOn(S3Client.prototype, 'destroy').mockImplementation(() => {})

    expect(await readTagCacheShardFromR2(1)).toHaveProperty('sm1')
    expect(await readTagCacheShardFromR2(2)).toHaveProperty('sm1')

    expect(send).toHaveBeenCalledTimes(2)
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal)
    const clients = new Set(send.mock.contexts)
    expect(clients.size).toBe(1)
    const [client] = clients as Set<S3Client>
    await expect(client.config.responseChecksumValidation()).resolves.toBe('WHEN_REQUIRED')
    expect(destroy).not.toHaveBeenCalled()
    closeTagCacheR2Client()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('returns null only for a missing shard and rejects other failures', async () => {
    stubR2Credentials()
    vi.spyOn(S3Client.prototype, 'send')
      .mockRejectedValueOnce(s3Failure('NoSuchKey', 404))
      .mockRejectedValueOnce(s3Failure('ServiceUnavailable', 503))
      .mockResolvedValueOnce({ Body: { transformToByteArray: async () => new TextEncoder().encode('not json') } } as never)

    await expect(readTagCacheShardFromR2(1)).resolves.toBeNull()
    await expect(readTagCacheShardFromR2(2)).rejects.toThrow('ServiceUnavailable placeholder')
    await expect(readTagCacheShardFromR2(3)).rejects.toThrow('Invalid tag cache shard')
  })

  it('gives up on a response body that never settles', async () => {
    vi.useFakeTimers()
    stubR2Credentials()
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: { transformToByteArray: () => new Promise<Uint8Array>(() => {}) },
    } as never)

    const outcome = readTagCacheShardFromR2(4).then(
      () => 'resolved',
      (error: Error) => `rejected:${error.name}`,
    )
    await vi.advanceTimersByTimeAsync(29_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('pending')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('rejected:TimeoutError')
  })

  it('gives up on a shard write that never settles', async () => {
    vi.useFakeTimers()
    stubR2Credentials()
    const signals: unknown[] = []
    let markSent: () => void = () => undefined
    const sent = new Promise<void>((resolve) => {
      markSent = resolve
    })
    vi.spyOn(S3Client.prototype, 'send').mockImplementation((_command: unknown, options?: { abortSignal?: unknown }) => {
      signals.push(options?.abortSignal)
      markSent()
      return new Promise(() => {})
    })

    const outcome = writeTagCacheShardToR2(5, { sm1: success(new Date().toISOString()) }).then(
      () => 'resolved',
      (error: Error) => `rejected:${error.name}`,
    )
    // gzip は実際の非同期 I/O で偽の時計では進まないので、PUT が始まるまで実時間で待ってから時計を進める
    await sent
    await vi.advanceTimersByTimeAsync(29_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('pending')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('rejected:TimeoutError')
    expect(signals).toHaveLength(1)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })

  it('keeps the collection path on the KV fallback when R2 fails', async () => {
    stubR2Credentials()
    vi.stubEnv('TAG_CACHE_BACKEND', 'r2-aggregate')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(s3Failure('InternalError', 500))
    const kvGet = vi.spyOn(kv, 'get').mockResolvedValue({ sm9: success(new Date().toISOString(), 'FromKV') })

    const shard = await readTagCacheShard('TAG_CACHE_9')

    expect(shard?.sm9.tags).toEqual([{ name: 'FromKV', isLocked: false }])
    expect(kvGet).toHaveBeenCalledWith('TAG_CACHE_9')
    expect(warn.mock.calls.flat().join(' ')).toContain('InternalError')
  })
})

const success = (fetchedAt: string, tag = 'Tag'): TagCacheEntry => ({
  tags: [{ name: tag, isLocked: false }],
  fetchedAt,
  source: 'nicolog',
})

const failure = (fetchedAt: string, source: 'nicolog' | 'getthumbinfo' = 'getthumbinfo'): TagCacheEntry => ({
  tags: [],
  fetchedAt,
  source,
  fail: {
    source,
    at: fetchedAt,
    reason: 'status_500',
  },
})

describe('tag-cache-store merge semantics', () => {
  it('keeps an existing success over a newer failure', () => {
    const existing = success('2026-05-01T00:00:00.000Z', 'Existing')
    const incoming = failure('2026-05-02T00:00:00.000Z')

    expect(pickTagCacheEntry(existing, incoming)).toBe(existing)
  })

  it('prefers an incoming success over an existing failure', () => {
    const existing = failure('2026-05-02T00:00:00.000Z')
    const incoming = success('2026-05-01T00:00:00.000Z', 'Incoming')

    expect(pickTagCacheEntry(existing, incoming)).toBe(incoming)
  })

  it('uses latest fetchedAt when entries have the same success state', () => {
    const older = success('2026-05-01T00:00:00.000Z', 'Older')
    const newer = success('2026-05-02T00:00:00.000Z', 'Newer')

    expect(pickTagCacheEntry(older, newer)).toBe(newer)
    expect(pickTagCacheEntry(newer, older)).toBe(newer)
  })

  it('reports unchanged shards when incoming entries lose to existing entries', () => {
    const existing = {
      sm1: success('2026-05-01T00:00:00.000Z', 'Existing')
    }
    const incoming = {
      sm1: failure('2026-05-02T00:00:00.000Z')
    }

    const result = mergeTagCacheShard(existing, incoming)

    expect(result.changed).toBe(false)
    expect(result.shard).toEqual(existing)
  })

  it('merges changed entries and new video ids', () => {
    const existing = {
      sm1: failure('2026-05-01T00:00:00.000Z')
    }
    const incoming = {
      sm1: success('2026-05-01T01:00:00.000Z', 'Merged'),
      sm2: success('2026-05-01T02:00:00.000Z', 'New')
    }

    const result = mergeTagCacheShard(existing, incoming)

    expect(result.changed).toBe(true)
    expect(result.shard.sm1.tags).toEqual([{ name: 'Merged', isLocked: false }])
    expect(result.shard.sm2.tags).toEqual([{ name: 'New', isLocked: false }])
  })
})
