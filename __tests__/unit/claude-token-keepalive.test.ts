// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as filesystem from 'node:fs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const workflow = readFileSync(
  '.github/workflows/claude-token-keepalive.yml',
  'utf8',
)
const source = workflow
  .split("node --input-type=module <<'NODE'\n")[1]
  .split('          NODE')[0]
  .replace(/^          /gm, '')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
// Vitest's VM cannot dynamically import from an AsyncFunction. Bridge only the
// built-in filesystem import; execute the workflow's request/retry/output logic unchanged.
const execute = new AsyncFunction(
  'filesystem',
  'process',
  'fetch',
  'setTimeout',
  'console',
  'Date',
  'AbortSignal',
  source.replace("await import('node:fs')", 'filesystem'),
)
const directories: string[] = []
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), 'oauth-regression-'))
  directories.push(path)
  return path
}
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true })
})

const validBody = {
  access_token: 'fixture-access',
  refresh_token: 'fixture-rotated',
  expires_in: 3600,
}
const reply = (
  status: number,
  retryAfter?: string,
  body: unknown = validBody,
) => ({
  status,
  headers: new Map(
    retryAfter === undefined ? [] : [['retry-after', retryAfter]],
  ),
  body: { cancel: vi.fn(async () => {}) },
  json: vi.fn(async () => body),
})
type Reply = ReturnType<typeof reply>

async function run(responses: Array<Reply | Error>, token = 'fixture-refresh') {
  const outputPath = join(directory(), 'output')
  writeFileSync(outputPath, '')
  let now = Date.parse('2026-10-02T00:00:00Z')
  const delays: number[] = []
  const messages: string[] = []
  const fetch = vi.fn(async () => {
    const response = responses.shift()
    if (!response || response instanceof Error) throw response
    return response
  })
  const timeout = vi.fn(() => 'fixture-abort-signal')
  await execute(
    filesystem,
    { env: { REFRESH_TOKEN: token, GITHUB_OUTPUT: outputPath } },
    fetch,
    (resolve: () => void, delay: number) => {
      delays.push(delay)
      now += delay
      resolve()
    },
    {
      log: (message: string) => messages.push(message),
      error: (message: string) => messages.push(message),
    },
    { now: () => now, parse: Date.parse },
    { timeout },
  )
  return {
    output: readFileSync(outputPath, 'utf8'),
    fetch,
    delays,
    messages,
    timeout,
  }
}

describe('OAuth keepalive actual workflow script', () => {
  it('recovers from 429 with the server delay and masks tokens before successful output', async () => {
    const limited = reply(429, '15', { private: 'fixture-provider-secret' })
    const r = await run([limited, reply(200)])
    expect(r.delays).toEqual([15000])
    expect(r.fetch).toHaveBeenCalledTimes(2)
    expect(r.fetch).toHaveBeenCalledWith(
      'https://console.anthropic.com/v1/oauth/token',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        signal: 'fixture-abort-signal',
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: 'fixture-refresh',
          client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
        }),
      }),
    )
    expect(r.timeout).toHaveBeenCalledWith(30000)
    expect(limited.json).not.toHaveBeenCalled()
    expect(limited.body.cancel).toHaveBeenCalledOnce()
    expect(r.output).toContain('success=true\n')
    expect(r.output).toContain('new_refresh_token=fixture-rotated\n')
    expect(r.messages).toContain('::add-mask::fixture-access')
    expect(r.messages).toContain('::add-mask::fixture-rotated')
    expect(r.messages.join('\n')).not.toContain('fixture-provider-secret')
  })

  it('uses an HTTP date Retry-After', async () => {
    const r = await run([
      reply(429, 'Fri, 02 Oct 2026 00:00:40 GMT'),
      reply(200),
    ])
    expect(r.delays).toEqual([40000])
  })

  it.each([undefined, 'invalid'])(
    'bounds retries with exponential fallback for %s',
    async (header) => {
      const r = await run([
        reply(429, header),
        reply(429, header),
        reply(429, header),
      ])
      expect(r.delays).toEqual([10000, 20000])
      expect(r.fetch).toHaveBeenCalledTimes(3)
      expect(r.output).toBe('success=false\nerror=rate_limited\n')
    },
  )

  it.each(['600', '9'.repeat(400)])(
    'does not retry sooner than a long Retry-After (%s)',
    async (header) => {
      const r = await run([reply(429, header)])
      expect(r.fetch).toHaveBeenCalledOnce()
      expect(r.delays).toEqual([])
      expect(r.output).toBe('success=false\nerror=rate_limited\n')
    },
  )

  it('reserves request time within the total retry budget', async () => {
    const r = await run([reply(429, '60'), reply(429, '60')])
    expect(r.delays).toEqual([60000])
    expect(r.fetch).toHaveBeenCalledTimes(2)
    expect(r.output).toContain('error=rate_limited\n')
  })

  it.each([400, 401, 403, 500, 503])(
    'does not replay HTTP %s or expose its body',
    async (status) => {
      const response = reply(status, undefined, {
        access_token: 'fixture-provider-secret',
      })
      const r = await run([response])
      expect(r.fetch).toHaveBeenCalledOnce()
      expect(r.delays).toEqual([])
      expect(response.json).not.toHaveBeenCalled()
      expect(r.output).toBe(`success=false\nerror=refresh_failed_${status}\n`)
      expect(r.messages.join('\n')).not.toContain('fixture-provider-secret')
    },
  )

  it('does not replay an ambiguous transport failure or log its exception', async () => {
    const r = await run([new Error('fixture-provider-secret')])
    expect(r.fetch).toHaveBeenCalledOnce()
    expect(r.output).toBe('success=false\nerror=refresh_transport_error\n')
    expect(r.messages.join('\n')).not.toContain('fixture-provider-secret')
  })

  it('does not contact the provider without a refresh token', async () => {
    const r = await run([], '')
    expect(r.fetch).not.toHaveBeenCalled()
    expect(r.output).toBe('success=false\nerror=refresh_token_not_set\n')
  })

  it('preserves the existing refresh token if no rotation is returned', async () => {
    const r = await run([
      reply(200, undefined, { access_token: 'fixture-access' }),
    ])
    expect(r.output).toContain('new_refresh_token=fixture-refresh\n')
    expect(r.output).toContain('success=true\n')
  })

  it.each([
    {},
    null,
    { ...validBody, expires_in: -1 },
    { ...validBody, expires_in: '3600' },
    { ...validBody, expires_in: Number.MAX_SAFE_INTEGER },
    { ...validBody, access_token: 'bad\ninjected=true' },
    { ...validBody, refresh_token: '' },
  ])(
    'rejects malformed success without publishing tokens: %j',
    async (body) => {
      const r = await run([reply(200, undefined, body)])
      expect(r.output).toBe('success=false\nerror=invalid_refresh_response\n')
      expect(r.messages.some((m) => m.startsWith('::add-mask::'))).toBe(false)
    },
  )

  it('rejects non-JSON success without replaying the POST', async () => {
    const response = reply(200)
    response.json.mockRejectedValue(new Error('fixture-provider-secret'))
    const r = await run([response])
    expect(r.fetch).toHaveBeenCalledOnce()
    expect(r.output).toBe('success=false\nerror=invalid_refresh_response\n')
    expect(r.messages.join('\n')).not.toContain('fixture-provider-secret')
  })
})

describe('OAuth failure reporting with a local gh fixture', () => {
  it.each(['rate_limited', 'refresh_failed_401', 'refresh_transport_error'])(
    'keeps %s failed and supplies appropriate guidance',
    (error) => {
      const path = directory()
      const bodyPath = join(path, 'issue-body')
      // This fake executable prevents real issues, notifications, and secret writes.
      writeFileSync(
        join(path, 'gh'),
        '#!/bin/bash\nif [ "$1 $2" = "issue list" ]; then exit 0; fi\nif [ "$1 $2" != "issue create" ]; then exit 99; fi\nwhile [ "$#" -gt 0 ]; do\nif [ "$1" = "--body" ]; then printf "%s" "$2" > "$FIXTURE_BODY"; break; fi\nshift\ndone\n',
        { mode: 0o700 },
      )
      const report = workflow
        .split('      - name: Report result')[1]
        .split('        run: |\n')[1]
        .replace(/^          /gm, '')
      const r = spawnSync('bash', ['-e', '-c', report], {
        encoding: 'utf8',
        env: {
          PATH: `${path}:/usr/bin:/bin`,
          NEEDS_REFRESH: 'true',
          REFRESH_SUCCESS: 'false',
          REFRESH_ERROR: error,
          REPO: 'fixture/repo',
          FIXTURE_BODY: bodyPath,
        },
      })
      expect(r.status).toBe(1)
      const body = readFileSync(bodyPath, 'utf8')
      if (error === 'rate_limited') {
        expect(body).toContain(
          'do not rotate credentials solely because of HTTP 429',
        )
        expect(body).not.toContain('must reauthenticate')
      } else if (error === 'refresh_failed_401') {
        expect(body).toContain('confirmed missing or invalid')
      } else {
        expect(body).toContain('does not prove that credentials are invalid')
      }
    },
  )
})
