// npm audit の結果を期限付き例外リストと照合する（外部依存・副作用なし）。
// moderate 以上は原則失敗。例外は期限内かつ dev 専用ノードに限り、本番依存には認めない。
// 期限は最長 MAX_EXCEPTION_DAYS 日先まで。延長は人がレビューする PR でだけ行う。

export const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical']
export const GATE_SEVERITY = 'moderate'
export const MAX_EXCEPTION_DAYS = 45
const EXCEPTION_KEYS = 'advisory,expires,package,reason,scope'
const GHSA = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/

const fail = (message) => {
  throw new Error(message)
}
const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const atLeastGate = (severity) =>
  SEVERITIES.indexOf(severity) >= SEVERITIES.indexOf(GATE_SEVERITY)

export const utcDate = (now = new Date()) => now.toISOString().slice(0, 10)
const addDays = (date, days) =>
  utcDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000))

function isCalendarDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text))
    return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && utcDate(date) === text
}

const ghsaOf = (url) =>
  /\/advisories\/(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})$/.exec(url)?.[1]

export function parseExceptions(value) {
  if (!Array.isArray(value)) fail('Audit exceptions must be a JSON array')
  const seen = new Set()
  return value.map((entry, index) => {
    const where = `Audit exception #${index + 1}`
    if (
      !isObject(entry) ||
      Object.keys(entry).sort().join(',') !== EXCEPTION_KEYS
    )
      fail(
        `${where} must have exactly advisory, package, reason, expires and scope`,
      )
    const { advisory, package: name, reason, expires, scope } = entry
    if (typeof advisory !== 'string' || !GHSA.test(advisory))
      fail(`${where}: advisory must be a GHSA ID`)
    if (typeof name !== 'string' || !name) fail(`${where}: package is required`)
    if (typeof reason !== 'string' || !reason.trim())
      fail(`${where}: reason is required`)
    if (!isCalendarDate(expires))
      fail(`${where}: expires must be a YYYY-MM-DD date`)
    if (scope !== 'dev')
      fail(
        `${where}: scope must be "dev"; runtime dependencies never get exceptions`,
      )
    const key = `${advisory} ${name}`
    if (seen.has(key)) fail(`${where} duplicates ${key}`)
    seen.add(key)
    return { advisory, package: name, reason, expires, scope }
  })
}

// 想定外の出力（レジストリ障害時の {error} や欠けた項目）は通さずに失敗させる
export function parseAuditReport(text, label) {
  let report
  try {
    report = JSON.parse(text)
  } catch {
    fail(`${label}: npm audit did not return JSON`)
  }
  if (
    !isObject(report) ||
    report.auditReportVersion !== 2 ||
    !isObject(report.vulnerabilities) ||
    !isObject(report.metadata?.vulnerabilities)
  ) {
    const detail =
      typeof report?.message === 'string' ? ` (${report.message})` : ''
    fail(`${label}: unexpected npm audit output${detail}`)
  }
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]))
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    const valid =
      isObject(vulnerability) &&
      vulnerability.name === name &&
      SEVERITIES.includes(vulnerability.severity) &&
      Array.isArray(vulnerability.via) &&
      vulnerability.via.every(
        (via) =>
          typeof via === 'string' ||
          (isObject(via) &&
            typeof via.url === 'string' &&
            SEVERITIES.includes(via.severity) &&
            typeof (via.dependency ?? via.name) === 'string'),
      ) &&
      Array.isArray(vulnerability.nodes) &&
      vulnerability.nodes.every((node) => typeof node === 'string')
    if (!valid) fail(`${label}: malformed vulnerability entry ${name}`)
    counts[vulnerability.severity] += 1
  }
  for (const severity of SEVERITIES) {
    if (report.metadata.vulnerabilities[severity] !== counts[severity])
      fail(`${label}: metadata counts do not match the vulnerability entries`)
  }
  return report
}

// 推移的な検出（via が文字列）は、元のアドバイザリまでたどる
function advisoriesBehind(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return []
  seen.add(name)
  const vulnerability = vulnerabilities[name]
  if (!vulnerability) fail(`npm audit references unknown vulnerability ${name}`)
  return vulnerability.via.flatMap((via) =>
    typeof via === 'string'
      ? advisoriesBehind(via, vulnerabilities, seen)
      : [via],
  )
}

export function evaluateAudit({ full, runtime, lockfile, exceptions, today }) {
  const packages = lockfile?.packages
  if (!isObject(packages))
    fail(
      'package-lock.json has no packages section (lockfileVersion 2 or later is required)',
    )
  if (!isCalendarDate(today)) fail('today must be a YYYY-MM-DD date')
  const failures = []
  const affected = new Map(
    exceptions.map((exception) => [exception, new Set()]),
  )
  const referenced = new Set()
  // 期限の上限。自動の修正で延長されても、短い間隔で人の再確認に戻るようにする
  const latest = addDays(today, MAX_EXCEPTION_DAYS)
  const expiryProblem = (exception) =>
    exception.expires < today
      ? 'has expired'
      : exception.expires > latest
        ? `expires after ${latest}`
        : null

  // 失敗メッセージは自動修正の指示にも渡るため、延長は人の判断だと明記する
  for (const exception of exceptions) {
    const where = `Audit exception ${exception.advisory} (${exception.package})`
    if (exception.expires < today)
      failures.push(
        `${where} expired on ${exception.expires}. ` +
          'Re-check the advisory for a patched version or an updated parent package, then remove the exception. ' +
          'Renewing it is a human decision: never extend it in an automated CI fix; ' +
          `only a PR a person reviews may renew it, with a new reason and an expiry at most ${MAX_EXCEPTION_DAYS} days ahead.`,
      )
    else if (exception.expires > latest)
      failures.push(
        `${where} expires on ${exception.expires}, more than ${MAX_EXCEPTION_DAYS} days after ${today}. ` +
          `Set the expiry to ${latest} or earlier so that a person re-checks the advisory at least every ${MAX_EXCEPTION_DAYS} days.`,
      )
  }

  for (const vulnerability of Object.values(runtime.vulnerabilities)) {
    if (atLeastGate(vulnerability.severity))
      failures.push(
        `Runtime dependency ${vulnerability.name} has a ${vulnerability.severity} vulnerability (npm audit --omit=dev); runtime dependencies never get exceptions`,
      )
  }

  for (const vulnerability of Object.values(full.vulnerabilities)) {
    if (!atLeastGate(vulnerability.severity)) continue
    const problems = []
    const matched = []
    const advisories = advisoriesBehind(
      vulnerability.name,
      full.vulnerabilities,
    ).filter((advisory) => atLeastGate(advisory.severity))
    if (advisories.length === 0) problems.push('no advisory found behind it')
    for (const advisory of advisories) {
      const id = ghsaOf(advisory.url)
      const name = advisory.dependency ?? advisory.name
      const exception = exceptions.find(
        (entry) => entry.advisory === id && entry.package === name,
      )
      if (exception) referenced.add(exception)
      const expiry = exception && expiryProblem(exception)
      if (!id) problems.push(`${advisory.url} has no GHSA ID`)
      else if (!exception)
        problems.push(`${id} (${name}) is not in the exception list`)
      else if (expiry) problems.push(`exception ${id} (${name}) ${expiry}`)
      else matched.push(exception)
    }
    if (vulnerability.nodes.length === 0)
      problems.push('npm audit listed no installed nodes')
    for (const node of vulnerability.nodes) {
      if (packages[node]?.dev !== true)
        problems.push(`${node} is not dev-only in package-lock.json`)
    }
    if (problems.length > 0)
      failures.push(
        `${vulnerability.name} (${vulnerability.severity}): ${problems.join('; ')}`,
      )
    else
      for (const exception of matched)
        affected.get(exception).add(vulnerability.name)
  }

  return {
    ok: failures.length === 0,
    failures,
    excepted: exceptions
      .filter((exception) => affected.get(exception).size > 0)
      .map((exception) => ({
        ...exception,
        affects: [...affected.get(exception)].sort(),
      })),
    unused: exceptions.filter(
      (exception) => !expiryProblem(exception) && !referenced.has(exception),
    ),
  }
}

export function formatReport(result) {
  const lines = []
  for (const exception of result.excepted) {
    lines.push(
      `Excepted ${exception.advisory} (${exception.package}, ${exception.scope} only, until ${exception.expires} UTC): ${exception.reason}`,
      `  affects: ${exception.affects.join(', ')}`,
    )
  }
  for (const exception of result.unused) {
    lines.push(
      `Notice: exception ${exception.advisory} (${exception.package}) no longer matches any finding; remove it`,
    )
  }
  for (const failure of result.failures) lines.push(`FAIL ${failure}`)
  lines.push(
    result.ok
      ? 'Dependency audit passed: no moderate or higher findings outside the dev-only exceptions'
      : `Dependency audit failed: ${result.failures.length} problem(s)`,
  )
  return lines
}
