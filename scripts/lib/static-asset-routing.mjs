import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export const HOST = 'nico-rank.com'
export const ROUTER = 'nico-ranking-api-gateway'
export const PREFIXES = ['/_next/static/']
export const PATTERNS = PREFIXES.map((prefix) => `https://${HOST}${prefix}*`)
// Separately prepared Vercel certificate/verification paths cannot overlap assets.
export const VALIDATION_PATTERNS = [
  `${HOST}/.well-known/acme-challenge/*`,
  `${HOST}/.well-known/vercel/*`,
]
const check = (condition, message) => {
  if (!condition) throw new Error(message)
}
export const sha256 = (body) => createHash('sha256').update(body).digest('hex')

export function validateOrigin(origin) {
  check(
    /^[a-z0-9-]+\.vercel-dns-\d+\.com$/.test(origin) ||
      origin === 'cname.vercel-dns.com',
    'Use the DNS target shown by Vercel, without scheme, path or trailing dot',
  )
}

export function staticPaths(html) {
  const paths = new Set()
  for (const match of html.matchAll(/(?:src|href)="([^"\s]+)"/g)) {
    const raw = match[1].replaceAll('&amp;', '&')
    if (!raw.startsWith('/') || raw.startsWith('//')) continue
    const url = new URL(raw, `https://${HOST}`)
    if (
      url.origin === `https://${HOST}` &&
      PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    ) {
      paths.add(url.pathname + url.search)
    }
  }
  check(
    paths.size > 0 && paths.size <= 300,
    'Expected 1–300 static references in production HTML',
  )
  return [...paths].sort()
}

export function compareAsset(path, current, origin) {
  const ext = new URL(path, `https://${HOST}`).pathname.split('.').pop()
  const mime = {
    js: /^(?:application|text)\/(?:x-)?javascript(?:;|$)/i,
    css: /^text\/css(?:;|$)/i,
    woff2: /^(?:font\/woff2|application\/font-woff)(?:;|$)/i,
  }[ext]
  check(mime, `Unsupported asset type: ${path}`)
  for (const [label, response] of [
    ['public', current],
    ['origin', origin],
  ]) {
    check(
      response.status === 200,
      `${label} ${path}: expected 200, got ${response.status}`,
    )
    check(
      mime.test(response.headers['content-type'] || ''),
      `${label} ${path}: incorrect MIME`,
    )
    check(response.body.length > 0, `${label} ${path}: empty body`)
    check(
      response.headers['x-content-type-options'] === 'nosniff',
      `${label} ${path}: missing nosniff`,
    )
    const cache = response.headers['cache-control'] || ''
    check(
      !/no-store|private|no-cache/i.test(cache) &&
        /(?:^|[, ])(?:s-maxage|max-age)=[1-9]\d*/i.test(cache),
      `${label} ${path}: not cacheable`,
    )
  }
  check(
    sha256(current.body) === sha256(origin.body),
    `Asset content differs: ${path}`,
  )
  return {
    path,
    sha256: sha256(origin.body),
    bytes: origin.body.length,
    contentType: origin.headers['content-type'],
  }
}

// Only operational metadata is retained, never credentials or response cookies.
export function normalizeState({ dns, routes, ssl, deployment }) {
  return {
    dns: dns
      .map(({ id, type, name, content, proxied }) => ({
        id,
        type,
        name,
        content,
        proxied,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    routes: routes
      .map(({ id, pattern, script, request_limit_fail_open }) => ({
        id,
        pattern,
        script: script || null,
        request_limit_fail_open: request_limit_fail_open === true,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    ssl,
    deployment: {
      id: deployment?.id,
      versions: deployment?.versions?.map(({ version_id, percentage }) => ({
        version_id,
        percentage,
      })),
    },
  }
}

export function validateState(state, origin) {
  validateOrigin(origin)
  check(
    state.dns.length === 1 &&
      state.dns[0].type === 'CNAME' &&
      state.dns[0].name === HOST &&
      state.dns[0].proxied === true &&
      state.dns[0].content.replace(/\.$/, '') === origin,
    'DNS origin must already point to the verified Vercel target with proxy enabled; no DNS changes are made by this tool',
  )
  check(['full', 'strict'].includes(state.ssl), 'Origin TLS must be enabled')
  check(
    state.routes.some((r) => r.pattern === `${HOST}/*` && r.script === ROUTER),
    'Production catch-all Router is missing',
  )
  check(
    !state.routes.some((r) => PATTERNS.includes(r.pattern)),
    'An exclusion route already exists; inspect instead of overwriting it',
  )
  // Avoid precedence ambiguity with unreviewed static-specific patterns.
  check(
    state.routes.every(
      (r) =>
        r.pattern === `${HOST}/*` ||
        (VALIDATION_PATTERNS.includes(r.pattern) && r.script === null) ||
        /^nico-rank\.com\/api\/[a-zA-Z0-9/_-]+\*?$/.test(r.pattern),
    ),
    'Unexpected route may overlap static assets; review all non-API patterns',
  )
  check(
    state.deployment?.versions?.length > 0,
    'No live Router version recorded',
  )
}

export async function buildPlan({ state, origin, probe, now = Date.now() }) {
  validateOrigin(origin)
  const blockers = []
  try {
    validateState(state, origin)
  } catch (error) {
    blockers.push(error.message)
  }
  let evidence
  try {
    evidence = await probe(origin)
    validateEvidence(evidence)
  } catch (error) {
    blockers.push(error.message)
  }
  return {
    schema: 1,
    createdAt: now,
    origin,
    patterns: PATTERNS,
    state,
    evidence,
    blockers,
    ready: blockers.length === 0,
  }
}

export function validatePlan(plan, state, now = Date.now()) {
  check(
    plan.schema === 1 && plan.ready === true && plan.blockers?.length === 0,
    'Plan is not ready',
  )
  check(
    Number.isFinite(plan.createdAt) &&
      now >= plan.createdAt &&
      now - plan.createdAt < 15 * 60 * 1000,
    'Plan expired; generate a fresh plan',
  )
  check(
    isDeepStrictEqual(plan.patterns, PATTERNS),
    'Only the reviewed Next.js static prefix may bypass the Worker',
  )
  validateEvidence(plan.evidence)
  validateState(state, plan.origin)
  check(
    isDeepStrictEqual(plan.state, state),
    'Cloudflare state changed after plan creation',
  )
}

function validateEvidence(evidence) {
  check(
    /^dpl_[a-zA-Z0-9]+$/.test(evidence?.deploymentId || ''),
    'Missing deployment evidence',
  )
  check(
    Array.isArray(evidence.assets) &&
      evidence.assets.length > 0 &&
      evidence.assets.length <= 300,
    'Missing asset evidence',
  )
  for (const prefix of PREFIXES)
    check(
      evidence.assets.some((a) => a.path?.startsWith(prefix)),
      `Missing ${prefix} evidence`,
    )
  for (const asset of evidence.assets) {
    check(
      PREFIXES.some((prefix) => asset.path?.startsWith(prefix)) &&
        /^[a-f0-9]{64}$/.test(asset.sha256) &&
        asset.bytes > 0 &&
        typeof asset.contentType === 'string',
      'Invalid asset evidence',
    )
  }
}

export async function rollbackRoutes(
  journal,
  { readState, removeRoute, persist, verifyRestored },
) {
  check(
    journal.schema === 1 && journal.before && Array.isArray(journal.created),
    'Invalid rollback journal',
  )
  let state = await readState()
  check(
    state.routes.some((r) => r.pattern === `${HOST}/*` && r.script === ROUTER),
    'Cannot remove exclusions without a healthy catch-all route',
  )
  // Delete only IDs returned by our own create operations, never all matching routes.
  for (const owned of [...journal.created].reverse()) {
    check(
      PATTERNS.includes(owned.pattern),
      'Journal contains an unapproved route',
    )
    check(
      !journal.before.routes.some((r) => r.id === owned.id),
      'Refusing to remove a pre-existing route',
    )
    state = await readState()
    check(
      state.routes.some(
        (r) => r.pattern === `${HOST}/*` && r.script === ROUTER,
      ),
      'Catch-all changed during rollback; inspect manually',
    )
    const live = state.routes.find((r) => r.id === owned.id)
    if (!live) continue
    check(
      live.pattern === owned.pattern && live.script === null,
      'Rollback conflict: route was changed by another operator',
    )
    await removeRoute(owned.id)
  }
  state = await readState()
  check(
    !state.routes.some((r) => PATTERNS.includes(r.pattern)),
    'Unrecorded exclusion remains; leave DNS untouched and inspect manually',
  )
  check(
    state.routes.some((r) => r.pattern === `${HOST}/*` && r.script === ROUTER),
    'Catch-all changed during rollback; inspect manually',
  )
  await verifyRestored()
  journal.status = 'rolled-back'
  await persist(journal)
}

export async function applyPlan(plan, ops) {
  validatePlan(plan, await ops.readState())
  // Fresh checks immediately before writes: never trust a previously successful TLS probe.
  const fresh = await ops.probe(plan.origin)
  check(
    isDeepStrictEqual(fresh, plan.evidence),
    'Deployment/assets changed; generate a fresh plan',
  )
  check(
    isDeepStrictEqual(await ops.readState(), plan.state),
    'Cloudflare state changed during preflight',
  )
  const journal = {
    schema: 1,
    before: plan.state,
    origin: plan.origin,
    created: [],
    status: 'applying',
  }
  await ops.persist(journal)
  try {
    for (const pattern of PATTERNS) {
      // A write that times out may still have succeeded. Record intent before sending it.
      journal.pending = pattern
      await ops.persist(journal)
      const route = await ops.createRoute(pattern)
      check(
        route.id && route.pattern === pattern && !route.script,
        'Unexpected route create result',
      )
      journal.created.push({ id: route.id, pattern })
      journal.pending = null
      await ops.persist(journal)
    }
    const live = await ops.readState()
    const expected = normalizeState({
      ...plan.state,
      routes: [
        ...plan.state.routes,
        ...journal.created.map((r) => ({ ...r, script: null })),
      ],
    })
    check(
      isDeepStrictEqual(live, expected),
      'Unexpected state after route creation',
    )
    await ops.verify(plan.evidence)
    journal.status = 'applied'
    await ops.persist(journal)
    return journal
  } catch (error) {
    try {
      await rollbackRoutes(journal, ops)
    } catch (rollbackError) {
      throw new Error(
        `Activation failed: ${error.message}. Rollback incomplete: ${rollbackError.message}. Inspect the saved journal; do not change DNS.`,
      )
    }
    throw new Error(
      `Activation failed; created exclusions were removed: ${error.message}`,
    )
  }
}
