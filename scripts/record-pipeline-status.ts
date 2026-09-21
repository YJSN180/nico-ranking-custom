import { readFile, access } from 'node:fs/promises'
import { createR2Store } from './lib/r2-store'

async function main() {
  const publication = JSON.parse(
    await readFile('./tmp/post-publish/publication.json', 'utf8'),
  )
  const tagsFailed = await access(
    './tmp/post-publish/auxiliary-error.json',
  ).then(
    () => true,
    () => false,
  )
  const failed = process.env.AUXILIARY_FAILED === 'true' || tagsFailed
  await createR2Store().write(
    'pipeline/auxiliary.json',
    Buffer.from(
      JSON.stringify({
        generation: publication.generation,
        failed,
        checkedAt: new Date().toISOString(),
      }),
    ),
    {},
  )
  if (failed)
    throw new Error(
      'Ranking published, but auxiliary synchronization needs repair',
    )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
