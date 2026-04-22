#!/usr/bin/env npx tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

type HealthBaseline = {
  checkedAt: string
  updatedAt: string | null
  ageMinutes: number | null
  totalVideos: number
}

const MAX_AGE_MINUTES = Number(process.env.VIDEO_STATS_MAX_AGE_MINUTES || '15')
const baselineFile = process.env.VIDEO_STATS_BASELINE_FILE
const outputFile = process.env.VIDEO_STATS_OUTPUT_FILE

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function readBaseline(path?: string): HealthBaseline | null {
  if (!path || !existsSync(path)) {
    return null
  }

  return JSON.parse(readFileSync(path, 'utf-8')) as HealthBaseline
}

function writeBaseline(path: string | undefined, baseline: HealthBaseline) {
  if (!path) {
    return
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(baseline, null, 2))
}

async function fetchVideoStatsLatest() {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const apiToken = requireEnv('CLOUDFLARE_API_TOKEN')
  const kvNamespaceId = requireEnv('CLOUDFLARE_KV_NAMESPACE_ID')

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/VIDEO_STATS_LATEST`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  )

  if (response.status === 404) {
    throw new Error('VIDEO_STATS_LATEST does not exist')
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch VIDEO_STATS_LATEST: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

async function main() {
  const stats = await fetchVideoStatsLatest()
  const updatedAt = stats?.metadata?.updatedAt || null
  const totalVideos = Number(stats?.metadata?.totalVideos || 0)
  const ageMinutes = updatedAt
    ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000 / 60)
    : null

  const baseline = readBaseline(baselineFile)
  const errors: string[] = []

  if (!updatedAt) {
    errors.push('VIDEO_STATS_LATEST.metadata.updatedAt is missing')
  }

  if (ageMinutes === null || ageMinutes > MAX_AGE_MINUTES) {
    errors.push(`VIDEO_STATS_LATEST is too old: ageMinutes=${ageMinutes}`)
  }

  if (totalVideos <= 0) {
    errors.push(`VIDEO_STATS_LATEST.metadata.totalVideos must be greater than 0 (current=${totalVideos})`)
  }

  if (baseline && baseline.totalVideos > 0 && totalVideos < baseline.totalVideos * 0.5) {
    errors.push(
      `VIDEO_STATS_LATEST totalVideos dropped below 50% of previous success (previous=${baseline.totalVideos}, current=${totalVideos})`,
    )
  }

  const currentBaseline: HealthBaseline = {
    checkedAt: new Date().toISOString(),
    updatedAt,
    ageMinutes,
    totalVideos,
  }

  writeBaseline(outputFile, currentBaseline)
  console.log(JSON.stringify({ baseline, current: currentBaseline }, null, 2))

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
