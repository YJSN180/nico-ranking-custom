import type { KVRankingData } from '../cloudflare-kv'
import { setRankingToKV } from '../cloudflare-kv'

export async function writeRankingToCloudflareKVApi(
  data: KVRankingData,
): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error('Cloudflare KV credentials not configured')
  }

  const pako = await import('pako')
  const jsonString = JSON.stringify(data)
  const compressed = pako.gzip(jsonString)

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/octet-stream',
    },
    body: compressed,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`)
  }

  const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/RANKING_LATEST`

  await fetch(metadataUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      compressed: true,
      version: 1,
      updatedAt: new Date().toISOString(),
      size: compressed.length,
      ngFiltered: true,
    }),
  })
}

export async function writeRankingToCloudflareKVBinding(
  data: KVRankingData,
): Promise<void> {
  await setRankingToKV(data)
}
