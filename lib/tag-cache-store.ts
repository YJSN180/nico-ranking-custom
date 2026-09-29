import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { TagDetail } from '../types/ranking'
import { parseBufferAsJSON, compressForStorage } from './unified-compression'
import { kv } from './simple-kv'
import { withDeadline } from './pipeline/retry'

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

const R2_REQUEST_TIMEOUT_MS = 20_000
// Also bounds waits the request abort cannot reach, such as body collection and gzip.
const R2_SHARD_DEADLINE_MS = 30_000

let sharedR2Client: S3Client | null = null

function getR2Client(): S3Client | null {
  if (
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.CLOUDFLARE_ACCOUNT_ID
  ) {
    return null
  }

  sharedR2Client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    // With response checksum validation the SDK pipes the body through a stream that
    // never ends when the connection is aborted or reset, so a read could hang forever.
    // gzip's own CRC and JSON parsing still reject corrupted shards.
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return sharedR2Client
}

export function closeTagCacheR2Client(): void {
  sharedR2Client?.destroy()
  sharedR2Client = null
}

function readProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

function getHttpStatus(error: unknown): number | undefined {
  const status = readProperty(readProperty(error, '$metadata'), 'httpStatusCode')
  return typeof status === 'number' ? status : undefined
}

function isMissingObject(error: unknown): boolean {
  return readProperty(error, 'Code') === 'NoSuchKey' ||
    readProperty(error, 'name') === 'NoSuchKey' ||
    getHttpStatus(error) === 404
}

/** Short, secret-free description of a storage failure for logs. */
export function describeStorageError(error: unknown): string {
  if (!(error instanceof Error)) return typeof error
  const status = getHttpStatus(error)
  const code = readProperty(error, 'code')
  const parts = [error.name]
  if (status !== undefined) parts.push(`http_${status}`)
  if (typeof code === 'string') parts.push(code)
  return `${parts.join(' ')}: ${error.message.slice(0, 200)}`
}

function isShard(value: unknown): value is TagCacheShard {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

/**
 * Reads one shard from R2. Resolves null only when R2 is not configured or the shard
 * does not exist; any other failure (including a timeout) rejects, so callers never
 * mistake an unreadable shard for an empty one and overwrite it.
 */
export async function readTagCacheShardFromR2(shardIdOrKey: string | number): Promise<TagCacheShard | null> {
  const client = getR2Client()
  if (!client) return null

  const read = async (): Promise<TagCacheShard | null> => {
    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME || 'nico-ranking',
          Key: getR2ShardKey(shardIdOrKey),
        }),
        { abortSignal: AbortSignal.timeout(R2_REQUEST_TIMEOUT_MS) },
      )
      const buffer = await bodyToArrayBuffer(response.Body)
      const shard = buffer ? await parseBufferAsJSON<unknown>(buffer) : null
      if (!isShard(shard)) {
        throw new Error(`Invalid tag cache shard in R2: ${getShardIdFromKey(String(shardIdOrKey))}`)
      }
      return shard
    } catch (error: unknown) {
      if (isMissingObject(error)) return null
      throw error
    }
  }

  return withDeadline(
    read(),
    R2_SHARD_DEADLINE_MS,
    `Tag cache shard read exceeded ${R2_SHARD_DEADLINE_MS / 1000}s`,
  )
}

export async function writeTagCacheShardToR2(shardIdOrKey: string | number, shard: TagCacheShard): Promise<void> {
  const client = getR2Client()
  if (!client) {
    throw new Error('R2 credentials not configured')
  }

  const write = async (): Promise<void> => {
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
      { abortSignal: AbortSignal.timeout(R2_REQUEST_TIMEOUT_MS) },
    )
  }

  await withDeadline(
    write(),
    R2_SHARD_DEADLINE_MS,
    `Tag cache shard write exceeded ${R2_SHARD_DEADLINE_MS / 1000}s`,
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
    let r2Shard: TagCacheShard | null = null
    try {
      r2Shard = await readTagCacheShardFromR2(shardKey)
    } catch (error: unknown) {
      console.warn(
        `[Tag Cache R2] Failed to read shard ${getShardIdFromKey(shardKey)} (${describeStorageError(error)}); trying KV`,
      )
    }
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
