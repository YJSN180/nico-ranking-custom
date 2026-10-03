// Read-only smoke check: the deployed Worker on workers.dev, then the public SSR, which must contain videos (not just HTTP 200).
// Admin response bodies are never read and no admin data is submitted.
// 使い方: node scripts/check-admin-gateway.mjs --worker <配備した Worker 名> [--direct-only]
// 想定外の応答では、ステータス・安全なヘッダー・本文の冒頭を出して失敗する（Cookie や認証ヘッダーは出さない）。
// 公開ドメインがゾーンの Cloudflare にチャレンジされたときだけは失敗にせず、::warning:: 注釈で手動確認を促す。
// 判定と再試行の方針は scripts/lib/gateway-check.mjs にある。5xx とタイムアウトは再試行せず 1 回で失敗にする。
import { parseArgs } from 'node:util'
import { runSmokeCheck } from './lib/gateway-check.mjs'

try {
  const { values } = parseArgs({
    options: {
      worker: { type: 'string' },
      'direct-only': { type: 'boolean', default: false },
    },
  })
  await runSmokeCheck({
    workerName: values.worker,
    directOnly: values['direct-only'],
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
