import { fetchChecked } from '../../lib/pipeline/retry'

export async function fetchVerifiedRanking(
  workerUrl: string,
  workerKey: string,
) {
  const url = new URL('/verify-ranking', workerUrl)
  if (url.protocol !== 'https:') throw new Error('Verification requires HTTPS')
  const response = await fetchChecked(url.toString(), {
    headers: { Authorization: `Bearer ${workerKey}` },
    redirect: 'error',
  })
  const result = (await response.json()) as {
    verifiedVia?: string
    activeWorker?: string
    generation?: string
    updatedAt?: string
    count?: number
  }
  if (
    result.verifiedVia !== 'production-router-service-binding' ||
    !['blue', 'green'].includes(result.activeWorker || '') ||
    typeof result.generation !== 'string' ||
    !result.generation ||
    typeof result.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(result.updatedAt)) ||
    typeof result.count !== 'number' ||
    !Number.isInteger(result.count) ||
    result.count <= 0
  )
    throw new Error('Invalid production gateway verification result')
  return result
}
