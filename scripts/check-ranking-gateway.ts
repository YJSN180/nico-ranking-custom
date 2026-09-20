#!/usr/bin/env npx tsx
import { createR2Store } from './lib/r2-store'
import { fetchVerifiedRanking } from './lib/verify-ranking-response'
import { CURRENT_KEY, rankingKey } from '../workers/utils/ranking-generation.js'

async function main() {
  const key = process.env.WORKER_AUTH_KEY
  if (!key) throw new Error('Missing WORKER_AUTH_KEY')
  const store = createR2Store()
  // Compare a stable publication. A concurrent publish is retried, never accepted as a match.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await store.read(CURRENT_KEY)
    const ranking = await store.read(
      rankingKey(before?.data, 'rankings/all/24h/all.json'),
    )
    const result = await fetchVerifiedRanking(
      process.env.VIDEO_STATS_WORKER_URL ||
        'https://video-stats-updater.yjsn180180.workers.dev',
      key,
    )
    const after = await store.read(CURRENT_KEY)
    const reread = await store.read(
      rankingKey(after?.data, 'rankings/all/24h/all.json'),
    )
    if (before?.etag !== after?.etag || ranking?.etag !== reread?.etag) continue
    if (
      !ranking ||
      result.generation !== (before?.data.generation || 'legacy') ||
      result.updatedAt !== ranking.data.metadata?.updatedAt ||
      result.count !== ranking.data.items?.length
    ) {
      throw new Error(
        'Production gateway does not match the current R2 ranking',
      )
    }
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          ...result,
          publicEdgeVerification:
            'not-checked-service-binding-does-not-test-WAF',
        },
        null,
        2,
      ),
    )
    return
  }
  throw new Error('Publication changed during every verification attempt')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
