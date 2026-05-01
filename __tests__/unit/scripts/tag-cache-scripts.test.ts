import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  loadDeltaArtifacts,
  mergeDeltaArtifacts,
} from '@/scripts/merge-tag-cache-deltas-to-r2'
import { migrateTagCacheKvToR2 } from '@/scripts/migrate-tag-cache-kv-to-r2'
import type { TagCacheDeltaArtifact, TagCacheShard } from '@/lib/tag-cache-store'

describe('tag cache scripts', () => {
  it('loads and merges delta artifacts from multiple groups', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tag-cache-delta-'))
    try {
      const group1: TagCacheDeltaArtifact = {
        version: 1,
        generatedAt: '2026-05-01T00:00:00.000Z',
        groupId: 1,
        totalGroups: 8,
        shards: {
          TAG_CACHE_1: {
            sm1: {
              tags: [],
              fetchedAt: '2026-05-01T00:00:00.000Z',
              source: 'getthumbinfo',
              fail: {
                source: 'getthumbinfo',
                at: '2026-05-01T00:00:00.000Z',
              },
            },
          },
        },
      }
      const group2: TagCacheDeltaArtifact = {
        version: 1,
        generatedAt: '2026-05-01T01:00:00.000Z',
        groupId: 2,
        totalGroups: 8,
        shards: {
          TAG_CACHE_1: {
            sm1: {
              tags: [{ name: 'Recovered', isLocked: true }],
              fetchedAt: '2026-05-01T01:00:00.000Z',
              source: 'nicolog',
            },
          },
          TAG_CACHE_2: {
            sm2: {
              tags: [{ name: 'New', isLocked: false }],
              fetchedAt: '2026-05-01T02:00:00.000Z',
              source: 'getthumbinfo',
            },
          },
        },
      }

      await writeFile(join(dir, 'tag-cache-delta-group-1.json'), JSON.stringify(group1))
      await writeFile(join(dir, 'tag-cache-delta-group-2.json'), JSON.stringify(group2))

      const artifacts = await loadDeltaArtifacts(dir)
      const merged = mergeDeltaArtifacts(artifacts)

      expect(artifacts).toHaveLength(2)
      expect(merged.TAG_CACHE_1.sm1.tags).toEqual([{ name: 'Recovered', isLocked: true }])
      expect(merged.TAG_CACHE_2.sm2.tags).toEqual([{ name: 'New', isLocked: false }])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not write R2 during migration dry-run', async () => {
    const kvShard: TagCacheShard = {
      sm1: {
        tags: [{ name: 'KV', isLocked: false }],
        fetchedAt: '2026-05-01T00:00:00.000Z',
        source: 'nicolog',
      },
    }
    const writeR2 = vi.fn()

    const summary = await migrateTagCacheKvToR2('dry-run', {
      readKV: async (shardId) => shardId === 0 ? kvShard : null,
      readR2: async () => null,
      writeR2,
    })

    expect(summary.wouldWrite).toBe(1)
    expect(summary.written).toBe(0)
    expect(writeR2).not.toHaveBeenCalled()
  })
})
