// @vitest-environment node
import { it, expect } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

it('enforces concurrent global limits, persists across restart, and resets UTC windows in workerd SQLite', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'search-budget-test-'))
  const bundle = await build({
    stdin: {
      contents: `
      import { SearchBudget } from './workers/search-budget'
      export class TestBudget extends SearchBudget {
        seed({ minuteOffset, dayOffset, minuteCount, dayCount }) {
          const seconds = Math.floor(Date.now()/1000)
          this.ctx.storage.sql.exec('INSERT OR REPLACE INTO budget VALUES (1, ?, ?, ?, ?)',
            Math.floor(seconds/60)+minuteOffset, Math.floor(seconds/86400)+dayOffset, minuteCount, dayCount)
        }
      }
      export default { async fetch(request, env) {
        const input = await request.json()
        const stub = env.BUDGET.getByName('search-budget-v1')
        return Response.json(input.seed ? (await stub.seed(input.seed), {seeded:true}) : await stub.take(input))
      }}
    `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    external: ['cloudflare:workers'],
  })
  const options = {
    ...convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2024-12-01',
      durableObjects: { BUDGET: { className: 'TestBudget', useSQLite: true } },
    }),
    resourcePersistencePath: directory,
  }
  let runtime = new Miniflare(options)
  const call = async (body: unknown) => {
    const response = await runtime.dispatchFetch('https://test.invalid', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(200)
    return response.json() as Promise<{ allowed: boolean; retryAfter: number }>
  }
  try {
    const results = await Promise.all(
      Array.from({ length: 30 }, () => call({ perMinute: 600, perDay: 7 })),
    )
    expect(results.filter((result) => result.allowed)).toHaveLength(7)
    await runtime.dispose()
    runtime = new Miniflare(options)
    expect((await call({ perMinute: 600, perDay: 7 })).allowed).toBe(false)
    await call({
      seed: { minuteOffset: -1, dayOffset: 0, minuteCount: 600, dayCount: 7 },
    })
    expect((await call({ perMinute: 600, perDay: 7 })).allowed).toBe(false)
    await call({
      seed: { minuteOffset: -1, dayOffset: -1, minuteCount: 600, dayCount: 7 },
    })
    expect((await call({ perMinute: 1, perDay: 7 })).allowed).toBe(true)
    const minuteLimited = await call({ perMinute: 1, perDay: 7 })
    expect(minuteLimited.allowed).toBe(false)
    expect(minuteLimited.retryAfter).toBeGreaterThan(0)
    expect(minuteLimited.retryAfter).toBeLessThanOrEqual(60)
  } finally {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
