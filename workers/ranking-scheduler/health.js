import {
  currentGeneration,
  pipelineHealth,
  rankingKey,
  STATS_SOURCE_KEY,
} from '../utils/ranking-generation.js'
import { readR2Json } from '../utils/r2-json.js'

export async function inspectPipeline(env) {
  const manifest = await currentGeneration(env.R2_BUCKET)
  const metadataObject = await env.R2_BUCKET.get(
    rankingKey(manifest, 'rankings/metadata.json'),
  )
  if (!metadataObject) throw new Error('Ranking metadata missing')
  const metadata = (await readR2Json(metadataObject)).data
  const stats = await env.STATS_KV.get('VIDEO_STATS_LATEST', 'json')
  const sourceObject = await env.R2_BUCKET.get(STATS_SOURCE_KEY)
  const source = sourceObject ? await sourceObject.json() : null
  const result = pipelineHealth(manifest || metadata, stats, source)
  const auxiliaryObject = await env.R2_BUCKET.get('pipeline/auxiliary.json')
  const auxiliary = auxiliaryObject ? await auxiliaryObject.json() : null
  if (auxiliary?.failed) result.problems.push('auxiliary-sync-failed')
  if (
    manifest &&
    result.rankingAge > 10 &&
    auxiliary?.generation !== manifest.generation
  )
    result.problems.push('auxiliary-sync-missing')
  const baselineObject = await env.R2_BUCKET.get('pipeline/health.json')
  const baseline = baselineObject ? await baselineObject.json() : null
  if (
    baseline?.totalVideos > 0 &&
    stats?.metadata?.totalVideos < baseline.totalVideos * 0.5
  )
    result.problems.push('stats-count-drop')
  const response = await fetch(
    'https://nico-rank.com/api/ranking?genre=all&period=24h',
    { signal: AbortSignal.timeout(15_000) },
  )
  if (!response.ok) result.problems.push('public-api-unavailable')
  else {
    const ranking = await response.json()
    const age = Date.now() - Date.parse(ranking.metadata?.updatedAt)
    if (
      !Array.isArray(ranking.items) ||
      !ranking.items.length ||
      !Number.isFinite(age) ||
      age > 150 * 60_000
    )
      result.problems.push('public-ranking-stale')
    if (
      manifest &&
      Date.now() - Date.parse(manifest.publishedAt) > 10 * 60_000 &&
      ranking.metadata?.updatedAt !== manifest.collectedAt
    )
      result.problems.push('public-generation-mismatch')
  }
  const state = {
    signature: result.problems.sort().join(','),
    generation: manifest?.generation || metadata.updatedAt,
    totalVideos: result.problems.length
      ? baseline?.totalVideos || 0
      : stats.metadata.totalVideos,
  }
  return {
    ...result,
    state,
    previousSignature: baseline?.signature,
    changed:
      state.signature !== baseline?.signature ||
      state.generation !== baseline?.generation ||
      state.totalVideos !== baseline?.totalVideos,
  }
}
