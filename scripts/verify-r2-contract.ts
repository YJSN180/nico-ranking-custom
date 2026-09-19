#!/usr/bin/env npx tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createR2Store } from './lib/r2-store'
import { fetchChecked } from '../lib/pipeline/retry'
import {
  CURRENT_KEY,
  STATS_SOURCE_KEY,
  rankingKey,
} from '../workers/utils/ranking-generation.js'

async function main() {
  const store = createR2Store()
  const expected = JSON.parse(
    await readFile('./tmp/post-publish/publication.json', 'utf8'),
  )
  const manifest = (await store.read(CURRENT_KEY))?.data || null
  if (manifest && manifest.generation !== expected.generation)
    throw new Error('Publication was superseded')
  const metadata = await store.read(
    rankingKey(manifest, 'rankings/metadata.json'),
  )
  if (metadata?.data.updatedAt !== expected.collectedAt)
    throw new Error('Metadata does not match the published artifact')
  for (const [pair, value] of Object.entries(
    metadata.data.tagsByGenrePeriod,
  ) as Array<[string, any]>) {
    const keys = [`rankings/${pair}/all.json`]
    if (value.tags.length)
      keys.push(
        `rankings/${pair}/tags/${encodeURIComponent(value.tags[0])}.json`,
      )
    for (const key of keys) {
      const result = await store.read(rankingKey(manifest, key))
      if (
        !result ||
        !Array.isArray(result.data.items) ||
        result.data.metadata?.updatedAt !== expected.collectedAt
      ) {
        throw new Error(`Invalid published ranking: ${key}`)
      }
    }
  }
  const {
    CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_KV_NAMESPACE_ID: namespace,
    WORKER_AUTH_KEY: workerKey,
  } = process.env
  if (!account || !token || !namespace || !workerKey)
    throw new Error('Missing post-publish credentials')
  type Stats = { metadata?: { updatedAt: string; totalVideos: number } }
  const getStats = async (): Promise<Stats> =>
    (
      await fetchChecked(
        `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/VIDEO_STATS_LATEST`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json() as Promise<Stats>
  const before = await getStats().catch((error) => {
    if (error.status === 404) return null
    throw error
  })
  // A trigger may finish even if its response is lost. Poll before deciding to retry the trigger.
  try {
    const response = await fetch(
      `${process.env.VIDEO_STATS_WORKER_URL || 'https://video-stats-updater.yjsn180180.workers.dev'}/trigger`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerKey}` },
        signal: AbortSignal.timeout(30_000),
      },
    )
    if ([401, 403].includes(response.status))
      throw new Error('Stats trigger authentication failed')
  } catch (error: any) {
    if (!['TimeoutError', 'AbortError'].includes(error.name)) throw error
  }
  for (let i = 0; i < 36; i++) {
    const stats = await getStats()
    const source = manifest ? (await store.read(STATS_SOURCE_KEY))?.data : null
    const fresh =
      stats.metadata?.updatedAt !== before?.metadata?.updatedAt &&
      Date.parse(stats.metadata?.updatedAt) >
        (Date.parse(before?.metadata?.updatedAt) || 0) &&
      Date.now() - Date.parse(stats.metadata.updatedAt) < 15 * 60_000
    const matches =
      !manifest ||
      (source?.generation === expected.generation &&
        source?.updatedAt === stats.metadata?.updatedAt)
    if (fresh && matches) {
      if (
        !(stats.metadata.totalVideos > 0) ||
        stats.metadata.totalVideos < (before?.metadata?.totalVideos || 0) * 0.5
      )
        throw new Error('Stats count drift')
      const publicResponse = await fetchChecked(
        'https://nico-rank.com/api/ranking?genre=all&period=24h',
      )
      const ranking = (await publicResponse.json()) as {
        metadata?: { updatedAt: string }
        items?: unknown[]
      }
      if (
        ranking.metadata?.updatedAt === expected.collectedAt &&
        ranking.items?.length === expected.counts['all/24h']
      ) {
        const output =
          process.env.VERIFY_OUTPUT_PATH ||
          './tmp/post-publish/verify-r2-contract.json'
        await mkdir(dirname(output), { recursive: true })
        await writeFile(
          output,
          JSON.stringify({
            checkedAt: new Date().toISOString(),
            generation: expected.generation,
            collectedAt: expected.collectedAt,
            statsUpdatedAt: stats.metadata.updatedAt,
            totalVideos: stats.metadata.totalVideos,
          }),
        )
        return
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error(
    'Published generation did not reach video stats and public API within 6 minutes',
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
