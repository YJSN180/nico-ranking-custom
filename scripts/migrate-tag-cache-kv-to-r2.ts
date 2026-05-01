#!/usr/bin/env npx tsx
import { fileURLToPath, pathToFileURL } from 'url'
import {
  TAG_CACHE_SHARDS,
  type TagCacheShard,
  mergeTagCacheShard,
  readTagCacheShardFromKV,
  readTagCacheShardFromR2,
  writeTagCacheShardToR2,
} from '../lib/tag-cache-store'

type Mode = 'dry-run' | 'execute'

interface MigrationDeps {
  readKV: (shardId: number) => Promise<TagCacheShard | null>
  readR2: (shardId: number) => Promise<TagCacheShard | null>
  writeR2: (shardId: number, shard: TagCacheShard) => Promise<void>
}

const defaultDeps: MigrationDeps = {
  readKV: readTagCacheShardFromKV,
  readR2: readTagCacheShardFromR2,
  writeR2: writeTagCacheShardToR2,
}

function parseMode(): Mode {
  if (process.argv.includes('--execute')) return 'execute'
  if (process.argv.includes('--dry-run')) return 'dry-run'
  throw new Error('Usage: npx tsx scripts/migrate-tag-cache-kv-to-r2.ts --dry-run|--execute')
}

export async function migrateTagCacheKvToR2(mode: Mode, deps: MigrationDeps = defaultDeps): Promise<{
  mode: Mode
  scanned: number
  missingInKv: number
  unchanged: number
  wouldWrite: number
  written: number
  entriesSeen: number
}> {
  let missingInKv = 0
  let unchanged = 0
  let wouldWrite = 0
  let written = 0
  let entriesSeen = 0

  for (let shardId = 0; shardId < TAG_CACHE_SHARDS; shardId += 1) {
    const kvShard = await deps.readKV(shardId)
    if (!kvShard) {
      missingInKv += 1
      console.log(`[Tag Cache Migration] TAG_CACHE_${shardId}: missing in KV`)
      continue
    }

    entriesSeen += Object.keys(kvShard).length
    const r2Shard = await deps.readR2(shardId) || {}
    const { shard, changed } = mergeTagCacheShard(r2Shard, kvShard)
    if (!changed) {
      unchanged += 1
      console.log(`[Tag Cache Migration] TAG_CACHE_${shardId}: unchanged`)
      continue
    }

    wouldWrite += 1
    if (mode === 'execute') {
      await deps.writeR2(shardId, shard)
      written += 1
      console.log(
        `[Tag Cache Migration] TAG_CACHE_${shardId}: wrote ${Object.keys(r2Shard).length} -> ${Object.keys(shard).length} entries`,
      )
    } else {
      console.log(
        `[Tag Cache Migration] TAG_CACHE_${shardId}: would write ${Object.keys(r2Shard).length} -> ${Object.keys(shard).length} entries`,
      )
    }
  }

  const summary = {
    mode,
    scanned: TAG_CACHE_SHARDS,
    missingInKv,
    unchanged,
    wouldWrite,
    written,
    entriesSeen,
  }
  console.log('[Tag Cache Migration] Summary:', JSON.stringify(summary, null, 2))
  return summary
}

async function main() {
  const mode = parseMode()
  await migrateTagCacheKvToR2(mode)
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(currentFile).href) {
  main().catch((error) => {
    console.error('[Tag Cache Migration] Failed:', error)
    process.exit(1)
  })
}
