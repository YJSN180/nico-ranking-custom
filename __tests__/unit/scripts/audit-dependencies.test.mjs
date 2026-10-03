import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  MAX_EXCEPTION_DAYS,
  SEVERITIES,
  evaluateAudit,
  formatReport,
  parseAuditReport,
  parseExceptions,
} from '../../../scripts/lib/audit-dependencies.mjs'

const BRACES = 'GHSA-vfj7-8cjw-p6xm'
const OTHER = 'GHSA-ch52-4w7c-c8xp'
const TODAY = '2026-10-04'

const advisory = (id = BRACES, name = 'braces', severity = 'high') => ({
  source: 1,
  name,
  dependency: name,
  title: `${name} advisory`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: '<=3.0.3',
})
const vulnerability = (
  name,
  severity,
  via,
  nodes = [`node_modules/${name}`],
) => ({
  name,
  severity,
  isDirect: false,
  via,
  effects: [],
  range: '*',
  nodes,
  fixAvailable: false,
})
function report(vulnerabilities) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]))
  for (const entry of vulnerabilities) counts[entry.severity] += 1
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(
      vulnerabilities.map((entry) => [entry.name, entry]),
    ),
    metadata: {
      vulnerabilities: { ...counts, total: vulnerabilities.length },
      dependencies: {},
    },
  })
}
// eslint-config-next → micromatch → braces の推移的な検出
const chain = () => [
  vulnerability('braces', 'high', [advisory()]),
  vulnerability('micromatch', 'high', ['braces']),
  vulnerability('eslint-config-next', 'high', ['micromatch']),
]
const lockfile = (braces = { dev: true }) => ({
  lockfileVersion: 3,
  packages: {
    '': { name: 'app' },
    'node_modules/braces': { version: '3.0.3', ...braces },
    'node_modules/micromatch': { version: '4.0.8', dev: true },
    'node_modules/eslint-config-next': { version: '15.5.25', dev: true },
    'node_modules/http-cache-semantics': { version: '4.2.0', dev: true },
    'node_modules/next': { version: '15.5.25' },
  },
})
const exception = (overrides = {}) => ({
  advisory: BRACES,
  package: 'braces',
  reason: 'no patched version; lint-only path',
  expires: '2026-11-04',
  scope: 'dev',
  ...overrides,
})
const run = ({
  full = chain(),
  runtime = [],
  lock = lockfile(),
  exceptions = [exception()],
  today = TODAY,
} = {}) =>
  evaluateAudit({
    full: parseAuditReport(report(full), 'npm audit'),
    runtime: parseAuditReport(report(runtime), 'npm audit --omit=dev'),
    lockfile: lock,
    exceptions: parseExceptions(exceptions),
    today,
  })

describe('evaluateAudit', () => {
  it('passes allowlisted dev-only findings and reports what was excepted', () => {
    const result = run()
    expect(result).toMatchObject({ ok: true, failures: [], unused: [] })
    expect(result.excepted).toEqual([
      {
        ...exception(),
        affects: ['braces', 'eslint-config-next', 'micromatch'],
      },
    ])
    const lines = formatReport(result)
    expect(lines[0]).toContain(
      `Excepted ${BRACES} (braces, dev only, until 2026-11-04 UTC)`,
    )
    expect(lines[0]).toContain('no patched version; lint-only path')
    expect(lines.at(-1)).toContain('Dependency audit passed')
  })

  it('accepts an exception through its expiry date (UTC, inclusive)', () => {
    expect(run({ today: '2026-11-04' }).ok).toBe(true)
  })

  it('fails when an allowlisted vulnerable node is a runtime dependency', () => {
    for (const flags of [{ dev: false }, {}, { devOptional: true }]) {
      const result = run({ lock: lockfile(flags) })
      expect(result.ok).toBe(false)
      expect(result.failures).toEqual([
        'braces (high): node_modules/braces is not dev-only in package-lock.json',
      ])
      expect(result.excepted.map((entry) => entry.affects)).toEqual([
        ['eslint-config-next', 'micromatch'],
      ])
    }
  })

  it('fails when an affected node is missing from package-lock.json', () => {
    const full = [
      vulnerability(
        'braces',
        'high',
        [advisory()],
        ['node_modules/x/node_modules/braces'],
      ),
    ]
    expect(run({ full }).failures).toEqual([
      'braces (high): node_modules/x/node_modules/braces is not dev-only in package-lock.json',
    ])
  })

  it('fails on expired exceptions and leaves any renewal to a human-reviewed PR', () => {
    const result = run({ today: '2026-11-05' })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toMatch(
      new RegExp(
        `^Audit exception ${BRACES} \\(braces\\) expired on 2026-11-04\\. Re-check the advisory`,
      ),
    )
    // 失敗ログは自動修正の指示に渡るため、延長を勧めず人のレビューに回す
    expect(result.failures[0]).toContain(
      'never extend it in an automated CI fix',
    )
    expect(result.failures[0]).toContain('only a PR a person reviews')
    expect(result.failures).toContain(
      `braces (high): exception ${BRACES} (braces) has expired`,
    )
    expect(result.excepted).toEqual([])
  })

  it(`fails on exceptions that expire more than ${MAX_EXCEPTION_DAYS} days ahead`, () => {
    expect(MAX_EXCEPTION_DAYS).toBe(45)
    expect(run({ exceptions: [exception({ expires: '2026-11-18' })] }).ok).toBe(
      true,
    )

    const tooFar = exception({ expires: '2026-11-19' })
    const result = run({ exceptions: [tooFar] })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toBe(
      `Audit exception ${BRACES} (braces) expires on 2026-11-19, more than 45 days after 2026-10-04. ` +
        'Set the expiry to 2026-11-18 or earlier so that a person re-checks the advisory at least every 45 days.',
    )
    expect(result.failures).toContain(
      `braces (high): exception ${BRACES} (braces) expires after 2026-11-18`,
    )
    expect(result.excepted).toEqual([])

    // 使われていなくても失敗させ、削除の案内には含めない
    const unused = run({ full: [], exceptions: [tooFar] })
    expect(unused.ok).toBe(false)
    expect(unused.unused).toEqual([])

    // 年をまたぐ上限も UTC の暦日で数える
    const newYear = { today: '2026-12-20' }
    expect(
      run({ ...newYear, exceptions: [exception({ expires: '2027-02-03' })] })
        .ok,
    ).toBe(true)
    expect(
      run({ ...newYear, exceptions: [exception({ expires: '2027-02-04' })] })
        .ok,
    ).toBe(false)
  })

  it('fails on expired exceptions even when the finding is gone', () => {
    const result = run({ full: [], today: '2026-11-05' })
    expect(result.ok).toBe(false)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('expired on 2026-11-04')
  })

  it('fails on advisories that are not allowlisted', () => {
    const unknown = run({
      full: [
        ...chain(),
        vulnerability('http-cache-semantics', 'moderate', [
          advisory(OTHER, 'http-cache-semantics', 'moderate'),
        ]),
      ],
    })
    expect(unknown.ok).toBe(false)
    expect(unknown.failures).toEqual([
      `http-cache-semantics (moderate): ${OTHER} (http-cache-semantics) is not in the exception list`,
    ])

    const empty = run({ exceptions: [] })
    expect(empty.ok).toBe(false)
    expect(empty.failures).toHaveLength(3)

    // 同じアドバイザリでも別パッケージの例外では通さない
    const otherPackage = run({
      exceptions: [exception({ package: 'micromatch' })],
    })
    expect(otherPackage.ok).toBe(false)
    expect(otherPackage.unused).toEqual([exception({ package: 'micromatch' })])
  })

  it('fails when a finding has an advisory without a GHSA ID', () => {
    const npmOnly = { ...advisory(), url: 'https://npmjs.com/advisories/1' }
    const result = run({ full: [vulnerability('braces', 'high', [npmOnly])] })
    expect(result.failures).toEqual([
      'braces (high): https://npmjs.com/advisories/1 has no GHSA ID',
    ])
  })

  it('ignores findings below moderate', () => {
    const low = vulnerability('tmp', 'low', [
      advisory('GHSA-aaaa-bbbb-cccc', 'tmp', 'low'),
    ])
    const result = run({ full: [...chain(), low], runtime: [low] })
    expect(result.ok).toBe(true)
    expect(result.excepted[0].affects).not.toContain('tmp')
  })

  it('fails on runtime findings (npm audit --omit=dev) even when allowlisted', () => {
    const result = run({
      runtime: [vulnerability('braces', 'high', [advisory()])],
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toEqual([
      'Runtime dependency braces has a high vulnerability (npm audit --omit=dev); runtime dependencies never get exceptions',
    ])
  })

  it('reports exceptions that no longer match any finding without failing', () => {
    const result = run({ full: [] })
    expect(result.ok).toBe(true)
    expect(result.unused).toEqual([exception()])
    expect(formatReport(result)[0]).toContain('no longer matches any finding')
  })

  it('fails closed on dangling references and missing lockfile data', () => {
    const dangling = [vulnerability('micromatch', 'high', ['braces'])]
    expect(() => run({ full: dangling })).toThrow(
      'unknown vulnerability braces',
    )
    expect(() =>
      run({ lock: { lockfileVersion: 1, dependencies: {} } }),
    ).toThrow('no packages section')
    expect(() => run({ today: '2026-13-01' })).toThrow('today must be')
  })
})

describe('parseAuditReport', () => {
  it('fails closed on malformed npm audit output', () => {
    const valid = JSON.parse(report(chain()))
    const cases = [
      ['', 'did not return JSON'],
      ['not json', 'did not return JSON'],
      ['null', 'unexpected npm audit output'],
      [
        JSON.stringify({
          message: 'request to registry failed',
          error: { summary: '' },
        }),
        'unexpected npm audit output (request to registry failed)',
      ],
      [
        JSON.stringify({ ...valid, auditReportVersion: 1 }),
        'unexpected npm audit output',
      ],
      [
        JSON.stringify({ ...valid, metadata: {} }),
        'unexpected npm audit output',
      ],
      [
        JSON.stringify({
          ...valid,
          metadata: {
            vulnerabilities: { ...valid.metadata.vulnerabilities, high: 0 },
          },
        }),
        'metadata counts do not match',
      ],
      [
        JSON.stringify({
          ...valid,
          vulnerabilities: {
            ...valid.vulnerabilities,
            braces: { ...valid.vulnerabilities.braces, via: 'braces' },
          },
        }),
        'malformed vulnerability entry braces',
      ],
      [
        JSON.stringify({
          ...valid,
          vulnerabilities: {
            ...valid.vulnerabilities,
            braces: { ...valid.vulnerabilities.braces, severity: 'urgent' },
          },
        }),
        'malformed vulnerability entry braces',
      ],
      [
        JSON.stringify({
          ...valid,
          vulnerabilities: {
            ...valid.vulnerabilities,
            braces: { ...valid.vulnerabilities.braces, nodes: undefined },
          },
        }),
        'malformed vulnerability entry braces',
      ],
      [
        JSON.stringify({
          ...valid,
          vulnerabilities: {
            ...valid.vulnerabilities,
            braces: {
              ...valid.vulnerabilities.braces,
              via: [{ severity: 'high' }],
            },
          },
        }),
        'malformed vulnerability entry braces',
      ],
    ]
    for (const [text, message] of cases) {
      expect(() => parseAuditReport(text, 'npm audit')).toThrow(message)
    }
  })
})

describe('parseExceptions', () => {
  it('rejects entries that are not expiring dev-only exceptions', () => {
    const cases = [
      [{}, 'must be a JSON array'],
      [[exception({ scope: 'runtime' })], 'scope must be "dev"'],
      [
        [exception({ expires: '2026-02-30' })],
        'expires must be a YYYY-MM-DD date',
      ],
      [
        [{ advisory: BRACES, package: 'braces', reason: 'r', scope: 'dev' }],
        'must have exactly',
      ],
      [[{ ...exception(), expiry: '2026-11-04' }], 'must have exactly'],
      [
        [exception({ advisory: 'CVE-2026-0001' })],
        'advisory must be a GHSA ID',
      ],
      [[exception({ reason: ' ' })], 'reason is required'],
      [[exception({ package: '' })], 'package is required'],
      [[exception(), exception()], `duplicates ${BRACES} braces`],
    ]
    for (const [value, message] of cases) {
      expect(() => parseExceptions(value)).toThrow(message)
    }
  })

  it('accepts the committed exception list', () => {
    const committed = JSON.parse(
      readFileSync(
        join(process.cwd(), '.github/audit-exceptions.json'),
        'utf8',
      ),
    )
    const exceptions = parseExceptions(committed)
    expect(exceptions.length).toBeGreaterThan(0)
    expect(exceptions.every((entry) => entry.scope === 'dev')).toBe(true)
  })
})
