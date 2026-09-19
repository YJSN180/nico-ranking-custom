export const CURRENT_KEY = 'rankings/current.json'
export const STATS_SOURCE_KEY = 'pipeline/video-stats-source.json'

export function validateManifest(value) {
  if (
    value?.version !== 1 ||
    !/^\d+-\d+$/.test(value.generation) ||
    !Number.isFinite(Date.parse(value.collectedAt)) ||
    !Number.isFinite(Date.parse(value.publishedAt)) ||
    !value.counts ||
    typeof value.counts !== 'object' ||
    Array.isArray(value.counts) ||
    !Object.keys(value.counts).length ||
    Object.entries(value.counts).some(
      ([pair, count]) =>
        !/^[a-z]+\/(24h|hour)$/.test(pair) ||
        !Number.isInteger(count) ||
        count < 0,
    )
  )
    throw new Error('Invalid ranking manifest')
  return value
}

export function rankingKey(manifest, key) {
  if (!manifest) return key
  validateManifest(manifest)
  if (
    !key.startsWith('rankings/') ||
    key.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('Invalid ranking key')
  return `rankings/generations/${manifest.generation}/${key.slice('rankings/'.length)}`
}

export async function currentGeneration(bucket) {
  const object = await bucket.get(CURRENT_KEY)
  // Only absence means legacy. An unreadable manifest must never expose partial legacy data.
  return object ? validateManifest(await object.json()) : null
}

export function pipelineHealth(manifest, stats, source, now = Date.now()) {
  const problems = []
  const age = (value) =>
    Number.isFinite(Date.parse(value))
      ? (now - Date.parse(value)) / 60_000
      : Infinity
  const rankingAge = age(manifest?.publishedAt ?? manifest?.updatedAt)
  if (rankingAge > 90 || rankingAge < -1)
    problems.push(rankingAge > 120 ? 'ranking-critical' : 'ranking-stale')
  if (
    manifest?.collectedAt &&
    (age(manifest.collectedAt) > 150 || age(manifest.collectedAt) < -1)
  )
    problems.push('ranking-source-stale')
  const statsAge = age(stats?.metadata?.updatedAt)
  if (statsAge > 15 || statsAge < -1) problems.push('stats-stale')
  if (!(stats?.metadata?.totalVideos > 0)) problems.push('stats-empty')
  if (
    manifest?.generation &&
    (source?.generation !== manifest.generation ||
      source?.updatedAt !== stats?.metadata?.updatedAt)
  ) {
    // Allow a newly published generation one refresh interval to propagate into KV.
    if (rankingAge > 10) problems.push('stats-generation-mismatch')
  }
  return { problems, rankingAge, statsAge }
}
