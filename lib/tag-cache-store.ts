import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { TagDetail } from '../types/ranking'
import { parseBufferAsJSON, compressForStorage } from './unified-compression'
import { kv } from './simple-kv'

export const TAG_CACHE_KEY_PREFIX = 'TAG_CACHE_'
export const TAG_CACHE_SHARDS = 100
export const TAG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

export type TagSource = 'nicolog' | 'getthumbinfo'

export interface TagCacheFailure {
  source: TagSource
  at: string
  reason?: string
}

export interface TagCacheEntry {
  tags: TagDetail[]
  fetchedAt: string
  source?: TagSource
  fail?: TagCacheFailure
}

export type TagCacheShard = Record<string, TagCacheEntry>
export type TagCacheByShard = Record<string, TagCacheShard>

export interface TagCacheDeltaArtifact {
  version: 1
  generatedAt: string
  groupId: number | null
  totalGroups: number | null
  shards: TagCacheByShard
}

type TagCacheBackend = 'kv' | 'r2-aggregate'

const deltaByShard: TagCacheByShard = {}

function cloneShard(shard: TagCacheShard): TagCacheShard {
  return JSON.parse(JSON.stringify(shard)) as TagCacheShard
}

function cloneDelta(): TagCacheByShard {
  const cloned: TagCacheByShard = {}
  for (const [shardKey, shard] of Object.entries(deltaByShard)) {
    cloned[shardKey] = cloneShard(shard)
  }
  return cloned
}

export function getTagCacheBackend(): TagCacheBackend {
  return process.env.TAG_CACHE_BACKEND === 'r2-aggregate' ? 'r2-aggregate' : 'kv'
}

export function getShardKeyForVideoId(videoId: string): string {
  let hash = 0
  for (let i = 0; i < videoId.length; i += 1) {
    hash = ((hash << 5) - hash) + videoId.charCodeAt(i)
    hash |= 0
  }
  const shard = Math.abs(hash) % TAG_CACHE_SHARDS
  return `${TAG_CACHE_KEY_PREFIX}${shard}`
}

export function getShardIdFromKey(shardKey: string): string {
  return shardKey.startsWith(TAG_CACHE_KEY_PREFIX)
    ? shardKey.slice(TAG_CACHE_KEY_PREFIX.length)
    : shardKey
}

export function getR2ShardKey(shardIdOrKey: string | number): string {
  const shardId = getShardIdFromKey(String(shardIdOrKey))
  const prefix = process.env.TAG_CACHE_R2_PREFIX || 'tag-cache/v1'
  return `${prefix}/shards/${shardId}.json.gz`
}

export function resetTagCacheDelta(): void {
  for (const key of Object.keys(deltaByShard)) {
    delete deltaByShard[key]
  }
}

export function hasTagCacheDelta(): boolean {
  return Object.values(deltaByShard).some((shard) => Object.keys(shard).length > 0)
}

export function getTagCacheDelta(): TagCacheByShard {
  return cloneDelta()
}

export function recordTagCacheDelta(shardKey: string, videoId: string, entry: TagCacheEntry): void {
  if (getTagCacheBackend() !== 'r2-aggregate') return
  deltaByShard[shardKey] = deltaByShard[shardKey] || {}
  deltaByShard[shardKey][videoId] = JSON.parse(JSON.stringify(entry)) as TagCacheEntry
}

export async function writeTagCacheDeltaArtifact(
  filePath: string,
  meta: { groupId?: number; totalGroups?: number },
): Promise<boolean> {
  if (getTagCacheBackend() !== 'r2-aggregate' || !hasTagCacheDelta()) {
    return false
  }

  const { mkdir, writeFile } = await import('fs/promises')
  const { dirname } = await import('path')
  const artifact: TagCacheDeltaArtifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    groupId: meta.groupId ?? null,
    totalGroups: meta.totalGroups ?? null,
    shards: cloneDelta(),
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(artifact, null, 2))
  return true
}

function createR2Client(): S3Client | null {
  if (
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.CLOUDFLARE_ACCOUNT_ID
  ) {
    return null
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

async function bodyToArrayBuffer(body: unknown): Promise<ArrayBuffer | null> {
  if (!body) return null
  const streamBody = body as {
    transformToByteArray?: () => Promise<Uint8Array>
    transformToString?: () => Promise<string>
  }

  if (streamBody.transformToByteArray) {
    const bytes = await streamBody.transformToByteArray()
    const copy = new Uint8Array(bytes)
    return copy.buffer
  }

  if (streamBody.transformToString) {
    const text = await streamBody.transformToString()
    const bytes = new TextEncoder().encode(text)
    const copy = new Uint8Array(bytes)
    return copy.buffer
  }

  return null
}

export async function readTagCacheShardFromR2(shardIdOrKey: string | number): Promise<TagCacheShard | null> {
  const client = createR2Client()
  if (!client) return null

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || 'nico-ranking',
        Key: getR2ShardKey(shardIdOrKey),
      }),
    )
    const buffer = await bodyToArrayBuffer(response.Body)
    if (!buffer) return null
    return await parseBufferAsJSON<TagCacheShard>(buffer)
  } catch (error: any) {
    if (error?.Code === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
      return null
    }
    console.warn('[Tag Cache R2] Failed to read shard:', error)
    return null
  }
}

export async function writeTagCacheShardToR2(shardIdOrKey: string | number, shard: TagCacheShard): Promise<void> {
  const client = createR2Client()
  if (!client) {
    throw new Error('R2 credentials not configured')
  }

  const compressionResult = await compressForStorage(shard)
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'nico-ranking',
      Key: getR2ShardKey(shardIdOrKey),
      Body: compressionResult.compressedData,
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
      CacheControl: 'private, max-age=3600',
      Metadata: {
        version: '1',
        updatedAt: new Date().toISOString(),
        entries: String(Object.keys(shard).length),
      },
    }),
  )
}

export async function readTagCacheShardFromKV(shardIdOrKey: string | number): Promise<TagCacheShard | null> {
  const shardKey = String(shardIdOrKey).startsWith(TAG_CACHE_KEY_PREFIX)
    ? String(shardIdOrKey)
    : `${TAG_CACHE_KEY_PREFIX}${shardIdOrKey}`
  return kv.get<TagCacheShard>(shardKey)
}

export async function readTagCacheShard(shardKey: string): Promise<TagCacheShard | null> {
  if (getTagCacheBackend() === 'r2-aggregate') {
    const r2Shard = await readTagCacheShardFromR2(shardKey)
    if (r2Shard) return r2Shard
    return readTagCacheShardFromKV(shardKey)
  }

  return readTagCacheShardFromKV(shardKey)
}

function isSuccessEntry(entry: TagCacheEntry | undefined): boolean {
  return Boolean(entry?.tags && entry.tags.length > 0)
}

function entryTime(entry: TagCacheEntry | undefined): number {
  if (!entry) return 0
  const raw = entry.fetchedAt || entry.fail?.at
  const parsed = raw ? Date.parse(raw) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export function pickTagCacheEntry(existing: TagCacheEntry | undefined, incoming: TagCacheEntry): TagCacheEntry {
  if (!existing) return incoming

  const existingSuccess = isSuccessEntry(existing)
  const incomingSuccess = isSuccessEntry(incoming)
  if (existingSuccess && !incomingSuccess) return existing
  if (!existingSuccess && incomingSuccess) return incoming

  return entryTime(incoming) >= entryTime(existing) ? incoming : existing
}

export function mergeTagCacheShard(
  existing: TagCacheShard,
  incoming: TagCacheShard,
): { shard: TagCacheShard; changed: boolean } {
  const merged = cloneShard(existing || {})
  let changed = false

  for (const [videoId, incomingEntry] of Object.entries(incoming || {})) {
    const current = merged[videoId]
    const picked = pickTagCacheEntry(current, incomingEntry)
    if (JSON.stringify(current) !== JSON.stringify(picked)) {
      merged[videoId] = JSON.parse(JSON.stringify(picked)) as TagCacheEntry
      changed = true
    }
  }

  return { shard: merged, changed }
}
