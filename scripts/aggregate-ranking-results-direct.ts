#!/usr/bin/env npx tsx
import { readdir, readFile, writeFile, rename } from 'node:fs/promises'
import {
  aggregateArtifacts,
  type GroupArtifact,
} from '../lib/pipeline/publication-contract'

async function main() {
  const files = (await readdir('./tmp')).filter((name) =>
    /^ranking-group-\d+\.json$/.test(name),
  )
  const artifacts: GroupArtifact[] = await Promise.all(
    files.map(async (name) => {
      const artifact = JSON.parse(await readFile(`./tmp/${name}`, 'utf8'))
      if (name !== `ranking-group-${artifact.groupId}.json`)
        throw new Error(`Group filename mismatch: ${name}`)
      return artifact
    }),
  )
  const runId = process.env.GITHUB_RUN_ID
  if (!runId)
    throw new Error('GITHUB_RUN_ID is required for artifact provenance')
  const data = aggregateArtifacts(artifacts, runId)
  await writeFile(
    './tmp/latest-aggregated-data.json.partial',
    JSON.stringify(data),
  )
  await rename(
    './tmp/latest-aggregated-data.json.partial',
    './tmp/latest-aggregated-data.json',
  )
  console.log(JSON.stringify({ stage: 'aggregated', ...data.publication }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
