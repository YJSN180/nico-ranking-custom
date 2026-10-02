import { describe, it, expect } from 'vitest'
import {
  HOST,
  ROUTER,
  PATTERNS,
  VALIDATION_PATTERNS,
  normalizeState,
  validateOrigin,
  staticPaths,
  compareAsset,
  buildPlan,
  applyPlan,
  rollbackRoutes,
} from '../../../scripts/lib/static-asset-routing.mjs'

const origin = 'example.vercel-dns-017.com'
const response = (headers = {}, body = 'asset') => ({
  status: 200,
  body: Buffer.from(body),
  headers: {
    'content-type': 'application/javascript',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    ...headers,
  },
})
const evidence = () => ({
  deploymentId: 'dpl_123',
  assets: [
    compareAsset('/_next/static/app.js?dpl=dpl_123', response(), response()),
  ],
})
function baseline() {
  return normalizeState({
    dns: [
      { id: 'dns', name: HOST, type: 'CNAME', content: origin, proxied: true },
    ],
    ssl: 'full',
    deployment: {
      id: 'deployment',
      versions: [{ version_id: 'version', percentage: 100 }],
    },
    routes: [
      { id: 'router', pattern: `${HOST}/*`, script: ROUTER },
      { id: 'tags', pattern: `${HOST}/api/popular-tags`, script: 'tags' },
    ],
  })
}
async function fixture() {
  const state = baseline()
  const plan = await buildPlan({
    state: structuredClone(state),
    origin,
    probe: async () => evidence(),
  })
  const writes = []
  const saves = []
  let counter = 0
  const ops = {
    readState: async () => normalizeState(structuredClone(state)),
    probe: async () => evidence(),
    verify: async () => {},
    verifyRestored: async () => {},
    persist: async (value) => {
      saves.push(structuredClone(value))
    },
    createRoute: async (pattern) => {
      writes.push(['create', pattern])
      const route = { id: String(++counter).padStart(32, '0'), pattern }
      state.routes.push(route)
      return route
    },
    removeRoute: async (id) => {
      writes.push(['delete', id])
      state.routes = state.routes.filter((r) => r.id !== id)
    },
  }
  return { state, plan, ops, writes, saves }
}

describe('static asset bypass scope and probes', () => {
  it('extracts only Next.js static assets, preserving deployment queries', () => {
    expect(
      staticPaths(
        '<script src="/_next/static/a.js?dpl=dpl_1&amp;x=1"></script><link href="/fonts/f.woff2"><a href="/api/x.js"><img src="/_next/image?url=x"><script src="//evil.test/a.js"><link href="/_next/static/../../api/x.js">',
      ),
    ).toEqual(['/_next/static/a.js?dpl=dpl_1&x=1'])
    expect(PATTERNS).toEqual(['https://nico-rank.com/_next/static/*'])
  })
  it.each([
    'https://example.vercel.app',
    'attacker.example',
    'example.vercel-dns-017.com.evil',
    'nico-rank.com',
    'a.vercel-dns-017.com/path',
  ])('rejects unapproved origins: %s', (value) => {
    expect(() => validateOrigin(value)).toThrow()
  })
  it.each([
    ['redirect', { ...response(), status: 302 }],
    ['HTML', response({ 'content-type': 'text/html' })],
    ['uncacheable', response({ 'cache-control': 'private, max-age=3600' })],
    ['no-cache', response({ 'cache-control': 'no-cache, max-age=3600' })],
    ['zero TTL', response({ 'cache-control': 'public, max-age=0' })],
    ['no nosniff', response({ 'x-content-type-options': '' })],
    ['different body', response({}, 'other build')],
    ['empty body', response({}, '')],
  ])('rejects %s origin responses', (_, candidate) => {
    expect(() =>
      compareAsset('/_next/static/app.js', response(), candidate),
    ).toThrow()
  })
  it.each([
    '*nico-rank.com/*',
    'https://nico-rank.com/*',
    'nico-rank.com/_next/*',
    '*/*',
    'nico-rank.com/fonts/*',
  ])('blocks ambiguous existing route %s', async (pattern) => {
    const state = baseline()
    state.routes.push({ id: 'other', pattern, script: 'other' })
    const plan = await buildPlan({
      state,
      origin,
      probe: async () => evidence(),
    })
    expect(plan.ready).toBe(false)
    expect(plan.blockers.join()).toMatch(/overlap/)
  })
  it('does not mark a missing-prefix probe as ready', async () => {
    const data = evidence()
    data.assets.pop()
    expect(
      (await buildPlan({ state: baseline(), origin, probe: async () => data }))
        .ready,
    ).toBe(false)
  })
  it('preserves only the reviewed, no-Worker validation routes', async () => {
    const { state, ops, writes } = await fixture()
    state.routes.push(
      ...VALIDATION_PATTERNS.map((pattern, i) => ({
        id: `validation-${i}`,
        pattern,
        script: null,
      })),
    )
    const plan = await buildPlan({
      state: normalizeState(state),
      origin,
      probe: async () => evidence(),
    })
    expect(plan.ready).toBe(true)
    await applyPlan(plan, ops)
    expect(writes).toEqual(PATTERNS.map((p) => ['create', p]))
    state.routes.find((r) => r.id === 'validation-0').script =
      'unexpected-worker'
    const other = await buildPlan({
      state: normalizeState(state),
      origin,
      probe: async () => evidence(),
    })
    expect(other.ready).toBe(false)
  })
  it('records DNS and TLS blockers without allowing activation', async () => {
    const state = baseline()
    state.dns[0].content = 'router.workers.dev'
    const plan = await buildPlan({
      state,
      origin,
      probe: async () => {
        throw new Error('TLS handshake failed')
      },
    })
    expect(plan.ready).toBe(false)
    expect(plan.blockers).toHaveLength(2)
    const { ops, writes } = await fixture()
    await expect(applyPlan(plan, ops)).rejects.toThrow('not ready')
    expect(writes).toEqual([])
  })
})

describe('activation and recovery', () => {
  it('adds only HTTPS static exclusions, persists their IDs, then verifies', async () => {
    const { ops, writes, saves, plan } = await fixture()
    let verified = false
    ops.verify = async () => {
      verified = true
      expect(writes).toHaveLength(1)
    }
    const journal = await applyPlan(plan, ops)
    expect(journal.status).toBe('applied')
    expect(verified).toBe(true)
    expect(writes).toEqual(PATTERNS.map((p) => ['create', p]))
    expect(saves[0].created).toEqual([])
    expect(saves[1].pending).toBe(PATTERNS[0])
    expect(journal.created).toHaveLength(1)
  })
  it.each([
    'expired',
    'future',
    'scope',
    'DNS drift',
    'version drift',
    'TLS failure',
    'deployment change',
    'preflight drift',
  ])('performs zero mutations for %s', async (failure) => {
    const { plan, state, ops, writes } = await fixture()
    if (failure === 'expired') plan.createdAt -= 16 * 60 * 1000
    if (failure === 'future') plan.createdAt += 60000
    if (failure === 'scope') plan.patterns = [`${HOST}/*`]
    if (failure === 'DNS drift') state.dns[0].proxied = false
    if (failure === 'version drift') state.deployment.id = 'new'
    if (failure === 'TLS failure')
      ops.probe = async () => {
        throw new Error('TLS failed')
      }
    if (failure === 'deployment change')
      ops.probe = async () => ({ ...evidence(), deploymentId: 'dpl_new' })
    if (failure === 'preflight drift')
      ops.probe = async () => {
        state.ssl = 'strict'
        return evidence()
      }
    await expect(applyPlan(plan, ops)).rejects.toThrow()
    expect(writes).toEqual([])
  })
  it('keeps routes unchanged when creation is denied', async () => {
    const { plan, ops, state, writes, saves } = await fixture()
    ops.createRoute = async () => {
      throw new Error('API denied')
    }
    await expect(applyPlan(plan, ops)).rejects.toThrow(
      'created exclusions were removed',
    )
    expect(state.routes).toEqual(baseline().routes)
    expect(writes).toEqual([])
    expect(saves.at(-1).status).toBe('rolled-back')
  })
  it('rolls back the exclusion if live verification fails', async () => {
    const { plan, ops, state, writes } = await fixture()
    ops.verify = async () => {
      throw new Error('cache miss or wrong assets')
    }
    await expect(applyPlan(plan, ops)).rejects.toThrow(
      'created exclusions were removed',
    )
    expect(state.routes).toEqual(baseline().routes)
    expect(writes.slice(1).map((w) => w[1])).toEqual(['1'.padStart(32, '0')])
  })
  it('never deletes an unrecorded route when a timed-out POST may have succeeded', async () => {
    const { plan, ops, writes, saves } = await fixture()
    const create = ops.createRoute
    ops.createRoute = async (pattern) => {
      await create(pattern)
      throw new Error('request timed out')
    }
    await expect(applyPlan(plan, ops)).rejects.toThrow('Rollback incomplete')
    expect(writes.map((w) => w[0])).toEqual(['create'])
    expect(saves.at(-1).pending).toBe(PATTERNS[0])
  })
  it('stops rollback if another operator edits an owned route', async () => {
    const { plan, ops, state, writes } = await fixture()
    const journal = await applyPlan(plan, ops)
    state.routes.find((r) => r.pattern === PATTERNS[0]).script = 'other-worker'
    await expect(rollbackRoutes(journal, ops)).rejects.toThrow(
      'Rollback conflict',
    )
    expect(writes.filter((w) => w[0] === 'delete')).toEqual([])
  })
  it('refuses rollback without the catch-all Router', async () => {
    const { plan, ops, state, writes } = await fixture()
    const journal = await applyPlan(plan, ops)
    state.routes = state.routes.filter((r) => r.id !== 'router')
    await expect(rollbackRoutes(journal, ops)).rejects.toThrow('catch-all')
    expect(writes.filter((w) => w[0] === 'delete')).toEqual([])
  })
  it('is idempotent when successfully rolled-back IDs are absent', async () => {
    const { plan, ops, writes } = await fixture()
    const journal = await applyPlan(plan, ops)
    await rollbackRoutes(journal, ops)
    await rollbackRoutes(journal, ops)
    expect(writes.filter((w) => w[0] === 'delete')).toHaveLength(1)
  })
  it('cannot delete a pre-existing route through an edited journal', async () => {
    const { ops, writes } = await fixture()
    await expect(
      rollbackRoutes(
        {
          schema: 1,
          before: baseline(),
          created: [{ id: 'router', pattern: PATTERNS[0] }],
        },
        ops,
      ),
    ).rejects.toThrow('pre-existing')
    expect(writes).toEqual([])
  })
  it('does not claim recovery success when rankings remain unhealthy', async () => {
    const { plan, ops, saves } = await fixture()
    ops.verify = async () => {
      throw new Error('cache miss')
    }
    ops.verifyRestored = async () => {
      throw new Error('rankings empty')
    }
    await expect(applyPlan(plan, ops)).rejects.toThrow(
      'Rollback incomplete: rankings empty',
    )
    expect(saves.at(-1).status).not.toBe('rolled-back')
  })
  it('does not claim recovery when the catch-all disappears during deletion', async () => {
    const { plan, ops, state, writes } = await fixture()
    const journal = await applyPlan(plan, ops)
    const remove = ops.removeRoute
    ops.removeRoute = async (id) => {
      await remove(id)
      state.routes = state.routes.filter((r) => r.id !== 'router')
    }
    await expect(rollbackRoutes(journal, ops)).rejects.toThrow(
      'Catch-all changed',
    )
    expect(writes.filter((w) => w[0] === 'delete')).toHaveLength(1)
  })
})
