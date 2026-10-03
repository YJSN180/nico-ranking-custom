// アプリ依存の監査ゲート。moderate 以上は失敗させ、.github/audit-exceptions.json の
// 期限内・dev 専用の例外だけを許可する。本番依存（--omit=dev）は常に0件を求める。
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  evaluateAudit,
  formatReport,
  parseAuditReport,
  parseExceptions,
  utcDate,
} from './lib/audit-dependencies.mjs'

const rootUrl = new URL('..', import.meta.url)
const root = fileURLToPath(rootUrl)

function readJson(path) {
  try {
    return JSON.parse(readFileSync(new URL(path, rootUrl), 'utf8'))
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

// npm audit は検出があると終了コード 1 になるため、JSON の内容で判定する。
// NODE_ENV=production などで dev が省かれないよう、含める種別を明示する。
function audit(args) {
  const label = `npm audit ${args.join(' ')}`
  const result = spawnSync('npm', ['audit', '--json', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  if (result.stderr.trim()) process.stderr.write(result.stderr)
  return parseAuditReport(result.stdout, label)
}

try {
  const result = evaluateAudit({
    full: audit(['--include=dev', '--include=optional', '--include=peer']),
    runtime: audit(['--omit=dev', '--include=optional', '--include=peer']),
    lockfile: readJson('package-lock.json'),
    exceptions: parseExceptions(readJson('.github/audit-exceptions.json')),
    today: utcDate(),
  })
  for (const line of formatReport(result)) console.log(line)
  process.exitCode = result.ok ? 0 : 1
} catch (error) {
  console.error(
    `Dependency audit failed closed: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
