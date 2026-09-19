#!/usr/bin/env npx tsx
import { readFile, readdir } from 'node:fs/promises'
import { GENRE_GROUPS } from '../types/ranking-config'
import { compressForStorage } from '../lib/unified-compression'
import { fetchChecked } from '../lib/pipeline/retry'

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespace = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!account || !namespace || !token)
    throw new Error('Missing KV credentials')
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/`
  const headers = { Authorization: `Bearer ${token}` }
  const data = JSON.parse(
    await readFile('./tmp/latest-aggregated-data.json', 'utf8'),
  )
  if (Date.now() - Date.parse(data.publication.collectedAt) > 120 * 60_000)
    throw new Error('Auxiliary artifact is stale')
  for (const [groupId, genres] of Object.entries(GENRE_GROUPS)) {
    const value = {
      genres: Object.fromEntries(
        genres.map((genre) => [genre, data.genres[genre]]),
      ),
      metadata: {
        ...data.metadata,
        groupId: Number(groupId),
        genresInGroup: genres,
      },
    }
    const { compressedData } = await compressForStorage(value)
    await fetchChecked(`${base}RANKING_GROUP_${groupId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(compressedData),
    })
  }
  const entries = new Set<string>()
  for (const name of await readdir('./tmp')) {
    if (!/^ng-derived-group-\d+\.json$/.test(name)) continue
    const value = JSON.parse(await readFile(`./tmp/${name}`, 'utf8'))
    if (
      !Array.isArray(value.newEntries) ||
      value.newEntries.some((id: unknown) => typeof id !== 'string')
    )
      throw new Error('Invalid derived NG artifact')
    value.newEntries.forEach((id: string) => entries.add(id))
  }
  if (entries.size) {
    // Never replace an unavailable existing NG list with an empty one.
    const existing = await (
      await fetchChecked(`${base}ng-list-derived`, { headers })
    ).json()
    if (
      !Array.isArray(existing) ||
      existing.some((id) => typeof id !== 'string')
    )
      throw new Error('Invalid existing NG list')
    const merged = [...new Set([...existing, ...entries])]
    if (merged.length !== existing.length)
      await fetchChecked(`${base}ng-list-derived`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
