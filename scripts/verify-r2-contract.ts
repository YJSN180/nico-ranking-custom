#!/usr/bin/env npx tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createR2Store } from './lib/r2-store'
import { fetchVerifiedRanking } from './lib/verify-ranking-response'
import {
  sendStatsTrigger,
  waitForPublishedStats,
  type VideoStats,
} from './lib/wait-for-published-stats'
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
  const getStats = async (): Promise<VideoStats> =>
    (
      await fetchChecked(
        `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/VIDEO_STATS_LATEST`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json() as Promise<VideoStats>
  const before = await getStats().catch((error) => {
    if (error.status === 404) return null
    throw error
  })
  const workerUrl =
    process.env.VIDEO_STATS_WORKER_URL ||
    'https://video-stats-updater.yjsn180180.workers.dev'
  const { stats, ranking } = await waitForPublishedStats({
    expected: {
      generation: expected.generation,
      collectedAt: expected.collectedAt,
      allCount: expected.counts['all/24h'],
      generationMode: Boolean(manifest),
    },
    before,
    readStats: getStats,
    readSource: async () => (await store.read(STATS_SOURCE_KEY))?.data ?? null,
    readGatewayRanking: () => fetchVerifiedRanking(workerUrl, workerKey),
    trigger: () => sendStatsTrigger(workerUrl, workerKey),
  })
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
      statsUpdatedAt: stats.metadata?.updatedAt,
      totalVideos: stats.metadata?.totalVideos,
      rankingVerification: ranking,
      publicEdgeVerification:
        'not-checked-service-binding-does-not-test-WAF',
    }),
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
