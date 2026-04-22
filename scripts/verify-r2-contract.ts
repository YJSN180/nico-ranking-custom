#!/usr/bin/env npx tsx
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { parseBufferAsJSON } from '../lib/unified-compression.js'

type VideoStatsPayload = {
  stats?: Record<string, unknown>
  metadata?: {
    updatedAt?: string
    totalVideos?: number
  }
}

const BUCKET_NAME = 'nico-ranking'
const DEFAULT_WORKER_URL = 'https://video-stats-updater.yjsn180180.workers.dev'
const POLL_INTERVAL_MS = 10_000
const MAX_POLLS = 12

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function getOptionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] || fallback
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

async function bodyToArrayBuffer(body: any): Promise<ArrayBuffer> {
  const bytes = await body.transformToByteArray()
  return toArrayBuffer(bytes)
}

const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
const apiToken = requireEnv('CLOUDFLARE_API_TOKEN')
const kvNamespaceId = requireEnv('CLOUDFLARE_KV_NAMESPACE_ID')
const r2AccessKeyId = requireEnv('R2_ACCESS_KEY_ID')
const r2SecretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
const workerAuthKey = requireEnv('WORKER_AUTH_KEY')
const workerUrl = getOptionalEnv('VIDEO_STATS_WORKER_URL', DEFAULT_WORKER_URL)!
const outputPath = process.env.VERIFY_OUTPUT_PATH

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
})

async function fetchR2Json(key: string) {
  const [headResponse, getResponse] = await Promise.all([
    s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    ),
    s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    ),
  ])

  if (!getResponse.Body) {
    throw new Error(`R2 object has no body: ${key}`)
  }

  const buffer = await bodyToArrayBuffer(getResponse.Body)
  const parsed = await parseBufferAsJSON<Record<string, any>>(buffer)

  if (!parsed) {
    throw new Error(`Failed to parse R2 JSON: ${key}`)
  }

  return {
    data: parsed,
    contentEncoding: headResponse.ContentEncoding || 'identity',
  }
}

async function fetchVideoStatsLatest(): Promise<VideoStatsPayload | null> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/VIDEO_STATS_LATEST`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch VIDEO_STATS_LATEST: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as VideoStatsPayload
}

function pickSampleRankingKey(metadata: Record<string, any>): string {
  const genrePeriodKeys = Object.keys(metadata.tagsByGenrePeriod || {})

  if (genrePeriodKeys.length > 0) {
    const [genre, period] = genrePeriodKeys[0].split('/')
    if (genre && period) {
      return `rankings/${genre}/${period}/all.json`
    }
  }

  return 'rankings/all/24h/all.json'
}

async function triggerVideoStatsWorker() {
  const response = await fetch(`${workerUrl}/trigger`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerAuthKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to trigger video-stats-updater: ${response.status} ${response.statusText} ${errorText}`)
  }

  return await response.json()
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForFreshStats(previousUpdatedAt?: string | null) {
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    const current = await fetchVideoStatsLatest()
    const currentUpdatedAt = current?.metadata?.updatedAt

    if (currentUpdatedAt && currentUpdatedAt !== previousUpdatedAt) {
      return current
    }

    console.log(`Waiting for VIDEO_STATS_LATEST to advance... (${attempt}/${MAX_POLLS})`)
    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('VIDEO_STATS_LATEST.updatedAt did not advance after manual trigger')
}

function writeSummaryIfRequested(summary: Record<string, unknown>) {
  if (!outputPath) {
    return
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(summary, null, 2))
}

async function main() {
  console.log('Verifying R2 compression contract and post-publish video stats flow...')

  const previousStats = await fetchVideoStatsLatest()
  const previousUpdatedAt = previousStats?.metadata?.updatedAt || null
  const previousTotalVideos = previousStats?.metadata?.totalVideos || 0

  const metadataResult = await fetchR2Json('rankings/metadata.json')
  const sampleRankingKey = pickSampleRankingKey(metadataResult.data)
  const sampleRankingResult = await fetchR2Json(sampleRankingKey)

  if (!Array.isArray(sampleRankingResult.data.items) || sampleRankingResult.data.items.length === 0) {
    throw new Error(`Sample ranking data is empty: ${sampleRankingKey}`)
  }

  console.log(`metadata.json content-encoding: ${metadataResult.contentEncoding}`)
  console.log(`${sampleRankingKey} content-encoding: ${sampleRankingResult.contentEncoding}`)

  const triggerResult = await triggerVideoStatsWorker()
  console.log(`Triggered video-stats-updater: ${JSON.stringify(triggerResult)}`)

  const currentStats = await waitForFreshStats(previousUpdatedAt)
  const currentUpdatedAt = currentStats?.metadata?.updatedAt
  const currentTotalVideos = currentStats?.metadata?.totalVideos || 0

  if (!currentUpdatedAt) {
    throw new Error('VIDEO_STATS_LATEST.metadata.updatedAt is missing after trigger')
  }

  if (currentTotalVideos <= 0) {
    throw new Error('VIDEO_STATS_LATEST.metadata.totalVideos must be greater than 0')
  }

  if (previousTotalVideos > 0 && currentTotalVideos < previousTotalVideos * 0.5) {
    throw new Error(
      `VIDEO_STATS_LATEST totalVideos dropped too far: previous=${previousTotalVideos}, current=${currentTotalVideos}`,
    )
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    metadataContentEncoding: metadataResult.contentEncoding,
    sampleRankingKey,
    sampleRankingContentEncoding: sampleRankingResult.contentEncoding,
    previousUpdatedAt,
    currentUpdatedAt,
    previousTotalVideos,
    currentTotalVideos,
  }

  writeSummaryIfRequested(summary)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
