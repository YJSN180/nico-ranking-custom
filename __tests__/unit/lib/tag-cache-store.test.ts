import { describe, expect, it } from 'vitest'
import {
  mergeTagCacheShard,
  pickTagCacheEntry,
  type TagCacheEntry,
} from '@/lib/tag-cache-store'

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
