import { readFile, access } from 'node:fs/promises'
import { createR2Store } from './lib/r2-store'
import { autoNgFailedGroups } from '../lib/pipeline/auto-ng'

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
  // 自動NG を当てられずに公開した収集グループ（読み取り失敗・壊れた判定表）。公開は止めず、補助の失敗として残す
  const aggregated = await readFile('./tmp/latest-aggregated-data.json', 'utf8')
    .then((text): { publication?: unknown } => JSON.parse(text))
    .catch(() => null)
  const autoNgFailed = autoNgFailedGroups(aggregated?.publication)
  if (autoNgFailed.length)
    console.error(
      `[Auto NG] Published without auto NG for group(s) ${autoNgFailed.join(', ')}`,
    )
  const failed =
    process.env.AUXILIARY_FAILED === 'true' ||
    tagsFailed ||
    autoNgFailed.length > 0
  await createR2Store().write(
    'pipeline/auxiliary.json',
    Buffer.from(
      JSON.stringify({
        generation: publication.generation,
        failed,
        checkedAt: new Date().toISOString(),
        autoNgFailedGroups: autoNgFailed,
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
