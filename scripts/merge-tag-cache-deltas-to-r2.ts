#!/usr/bin/env npx tsx
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  type TagCacheDeltaArtifact,
  type TagCacheShard,
  getShardIdFromKey,
  mergeTagCacheShard,
  readTagCacheShardFromKV,
  readTagCacheShardFromR2,
  writeTagCacheShardToR2,
} from '../lib/tag-cache-store'

async function walkJsonFiles(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkJsonFiles(fullPath))
    } else if (
      entry.isFile() &&
      entry.name.startsWith('tag-cache-delta-group-') &&
      entry.name.endsWith('.json')
    ) {
      files.push(fullPath)
    }
  }
  return files
}

export async function loadDeltaArtifacts(tmpDir: string): Promise<TagCacheDeltaArtifact[]> {
  const files = await walkJsonFiles(tmpDir)
  const artifacts: TagCacheDeltaArtifact[] = []

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw) as TagCacheDeltaArtifact
    if (parsed.version !== 1 || !parsed.shards || typeof parsed.shards !== 'object') {
      throw new Error(`Invalid tag cache delta artifact: ${file}`)
    }
    artifacts.push(parsed)
  }

  return artifacts
}

export function mergeDeltaArtifacts(artifacts: TagCacheDeltaArtifact[]): Record<string, TagCacheShard> {
  const mergedByShard: Record<string, TagCacheShard> = {}

  for (const artifact of artifacts) {
    for (const [shardKey, incomingShard] of Object.entries(artifact.shards)) {
      const current = mergedByShard[shardKey] || {}
      mergedByShard[shardKey] = mergeTagCacheShard(current, incomingShard).shard
    }
  }

  return mergedByShard
}

async function readExistingShard(shardKey: string): Promise<TagCacheShard> {
  const fromR2 = await readTagCacheShardFromR2(shardKey)
  if (fromR2) return fromR2

  try {
    return await readTagCacheShardFromKV(shardKey) || {}
  } catch (error) {
    console.warn(`[Tag Cache Merge] KV fallback failed for ${shardKey}:`, error)
    return {}
  }
}

export async function mergeTagCacheDeltasToR2(tmpDir = './tmp'): Promise<{
  artifacts: number
  shardsSeen: number
  shardsWritten: number
  entriesMerged: number
}> {
  const artifacts = await loadDeltaArtifacts(tmpDir)
  if (artifacts.length === 0) {
    console.log('[Tag Cache Merge] No tag cache delta artifacts found')
    return {
      artifacts: 0,
      shardsSeen: 0,
      shardsWritten: 0,
      entriesMerged: 0,
    }
  }

  const deltaByShard = mergeDeltaArtifacts(artifacts)
  let shardsWritten = 0
  let entriesMerged = 0

  for (const [shardKey, incomingShard] of Object.entries(deltaByShard)) {
    const existing = await readExistingShard(shardKey)
    const { shard, changed } = mergeTagCacheShard(existing, incomingShard)
    entriesMerged += Object.keys(incomingShard).length

    if (!changed) {
      console.log(`[Tag Cache Merge] Skipped ${shardKey} (no changes)`)
      continue
    }

    await writeTagCacheShardToR2(getShardIdFromKey(shardKey), shard)
    shardsWritten += 1
    console.log(
      `[Tag Cache Merge] Wrote ${shardKey}: ${Object.keys(existing).length} -> ${Object.keys(shard).length} entries`,
    )
  }

  const summary = {
    artifacts: artifacts.length,
    shardsSeen: Object.keys(deltaByShard).length,
    shardsWritten,
    entriesMerged,
  }
  console.log('[Tag Cache Merge] Summary:', JSON.stringify(summary, null, 2))
  return summary
}

async function main() {
  const tmpDir = process.argv[2] || './tmp'
  await mergeTagCacheDeltasToR2(tmpDir)
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(currentFile).href) {
  main().catch((error) => {
    console.error('[Tag Cache Merge] Failed:', error)
    process.exit(1)
  })
}
