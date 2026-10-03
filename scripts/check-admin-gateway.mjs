// Read-only smoke check: public SSR must contain videos, not just return HTTP 200.
// Admin response bodies are never read and no admin data is submitted.
// 想定外の応答では、ステータス・安全なヘッダー・本文の冒頭を出して失敗する（Cookie や認証ヘッダーは出さない）。
// 判定と再試行の方針は scripts/lib/gateway-check.mjs にある。5xx とタイムアウトは再試行せず 1 回で失敗にする。
import { checkPublicGateway } from './lib/gateway-check.mjs'

checkPublicGateway().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
