#!/usr/bin/env npx tsx
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { publishRanking } from '../lib/pipeline/publish-ranking'
import { createR2Store } from './lib/r2-store'

async function main() {
  const data = JSON.parse(await readFile('./tmp/latest-aggregated-data.json', 'utf8'))
  const expectedRun = process.env.RESUME_RUN_ID || process.env.GITHUB_RUN_ID
  if (expectedRun && data.publication?.runId !== expectedRun) throw new Error('Foreign publication artifact')
  const store = createR2Store()
  const manifest = await publishRanking(store, data, process.env.RANKING_GENERATIONS_ENABLED === 'true')
  await mkdir('./tmp/post-publish', { recursive: true })
  await writeFile('./tmp/post-publish/publication.json', JSON.stringify(manifest))
  console.log(JSON.stringify({ stage: 'published', ...manifest }))
  try {
    const tags = await readFile('./tmp/tag-accumulation.json', 'utf8')
    JSON.parse(tags)
    await store.write('tag-accumulation.json', gzipSync(tags), { gzip: true })
  } catch (error: any) {
    // Publication is already committed; auxiliary failure must not hide that fact.
    await writeFile('./tmp/post-publish/auxiliary-error.json', JSON.stringify({ stage: 'tag-accumulation', failed: true }))
    if (error.code !== 'ENOENT') console.warn('Tag accumulation upload failed; previous tags retained')
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
