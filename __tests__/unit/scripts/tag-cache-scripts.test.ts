// @vitest-environment node
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  loadDeltaArtifacts,
  mergeDeltaArtifacts,
  mergeTagCacheDeltasToR2,
} from '@/scripts/merge-tag-cache-deltas-to-r2'
import { migrateTagCacheKvToR2 } from '@/scripts/migrate-tag-cache-kv-to-r2'
import { closeTagCacheR2Client, type TagCacheDeltaArtifact, type TagCacheShard } from '@/lib/tag-cache-store'
import { kv } from '@/lib/simple-kv'

afterEach(() => {
  closeTagCacheR2Client()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('tag cache scripts', () => {
  it('fails the merge instead of overwriting a shard whose R2 copy could not be read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tag-cache-merge-'))
    try {
      for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) vi.stubEnv(key, 'test-placeholder')
      const delta: TagCacheDeltaArtifact = {
        version: 1,
        generatedAt: '2026-05-01T00:00:00.000Z',
        groupId: 1,
        totalGroups: 8,
        shards: {
          TAG_CACHE_1: {
            sm1: { tags: [{ name: 'New', isLocked: false }], fetchedAt: '2026-05-01T00:00:00.000Z', source: 'nicolog' },
          },
        },
      }
      await writeFile(join(dir, 'tag-cache-delta-group-1.json'), JSON.stringify(delta))
      const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
        if (command instanceof GetObjectCommand) {
          throw Object.assign(new Error('R2 unavailable'), { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } })
        }
        return {}
      })
      vi.spyOn(kv, 'get').mockResolvedValue(null)

      await expect(mergeTagCacheDeltasToR2(dir)).rejects.toThrow('R2 unavailable')
      expect(send.mock.calls.some(([command]) => command instanceof PutObjectCommand)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

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
