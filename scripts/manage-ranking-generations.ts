import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createR2Client, createR2Store } from './lib/r2-store'
import {
  cleanupCandidates,
  rollbackGeneration,
} from '../lib/pipeline/generation-maintenance'
import { retry } from '../lib/pipeline/retry'
import {
  CURRENT_KEY,
  validateManifest,
} from '../workers/utils/ranking-generation.js'

async function main() {
  const [command, target] = process.argv.slice(2)
  if (!['rollback', 'cleanup'].includes(command))
    throw new Error(
      'Usage: rollback <generation> [--apply] | cleanup [--apply]',
    )
  const apply = process.argv.includes('--apply')
  const store = createR2Store()
  // Serialize rollback and GC. Normal publication cannot resurrect >7-day-old candidates.
  const lockKey = 'pipeline/maintenance-lease.json'
  const old = await store.read(lockKey)
  if (old?.data.expiresAt > Date.now())
    throw new Error('Maintenance is already running')
  const lease = {
    owner: crypto.randomUUID(),
    expiresAt: Date.now() + 10 * 60_000,
  }
  await store.write(
    lockKey,
    Buffer.from(JSON.stringify(lease)),
    old ? { ifMatch: old.etag } : { ifNoneMatch: '*' },
  )
  const lock = await store.read(lockKey)
  if (lock?.data.owner !== lease.owner)
    throw new Error('Maintenance lease was replaced')
  try {
    const assertOwned = async () => {
      if (
        Date.now() > lease.expiresAt - 60_000 ||
        (await store.read(lockKey))?.data.owner !== lease.owner
      ) {
        throw new Error('Maintenance deadline exceeded')
      }
    }
    if (command === 'rollback') {
      await assertOwned()
      console.log(
        JSON.stringify(
          await rollbackGeneration(store, target, apply, assertOwned),
        ),
      )
      return
    }
    const current = validateManifest((await store.read(CURRENT_KEY))?.data)
    const client = createR2Client()
    const Bucket = process.env.R2_BUCKET_NAME || 'nico-ranking'
    const objects: Array<{ key: string; modified: number }> = []
    let cursor: string | undefined
    do {
      await assertOwned()
      const page = await retry(() =>
        client.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: 'rankings/generations/',
            ContinuationToken: cursor,
          }),
          { abortSignal: AbortSignal.timeout(20_000) },
        ),
      )
      for (const object of page.Contents || [])
        if (object.Key)
          objects.push({
            key: object.Key,
            modified: object.LastModified?.getTime() || NaN,
          })
      cursor = page.IsTruncated ? page.NextContinuationToken : undefined
      if (page.IsTruncated && !cursor) throw new Error('R2 list cursor missing')
    } while (cursor)
    const candidates = cleanupCandidates(objects, current)
    console.log(
      JSON.stringify({
        apply,
        objects: candidates.length,
        current: current.generation,
      }),
    )
    if (apply)
      for (const Key of candidates) {
        await assertOwned()
        await retry(() =>
          client.send(new DeleteObjectCommand({ Bucket, Key }), {
            abortSignal: AbortSignal.timeout(20_000),
          }),
        )
      }
  } finally {
    await store.write(
      lockKey,
      Buffer.from(JSON.stringify({ ...lease, expiresAt: 0 })),
      { ifMatch: lock.etag },
    )
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
