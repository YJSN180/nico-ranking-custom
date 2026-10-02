import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  HOST,
  ROUTER,
  normalizeState,
  buildPlan,
  applyPlan,
  rollbackRoutes,
} from './lib/static-asset-routing.mjs'
import {
  probeOrigin,
  verifyBypass,
  checkPublic,
} from './lib/static-asset-probe.mjs'

const usage =
  'Usage: node scripts/static-asset-routing.mjs plan <vercel-dns-target> <new-plan.json> | apply <plan.json> <new-journal.json> | rollback <journal.json>'
const [mode, first, second, ...extra] = process.argv.slice(2)
async function main() {
  if (
    !['plan', 'apply', 'rollback'].includes(mode) ||
    !first ||
    extra.length ||
    (mode !== 'rollback' && !second) ||
    (mode === 'rollback' && second)
  )
    throw new Error(usage)
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token)
    throw new Error(
      'Set CLOUDFLARE_API_TOKEN using the existing approved credential route',
    )
  async function api(path, method = 'GET', body) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      },
    )
    const data = await response.json()
    if (!response.ok || !data.success)
      throw new Error(
        `Cloudflare ${method} failed: HTTP ${response.status}, codes ${(data.errors || []).map((e) => e.code).join(',')}`,
      )
    return data.result
  }
  const zones = await api(`/zones?name=${HOST}`)
  if (
    zones.length !== 1 ||
    zones[0].name !== HOST ||
    zones[0].account.id !== '5984977746a3dfcd71415bed5c324eb1'
  )
    throw new Error('Unexpected account/zone')
  const zone = `/zones/${zones[0].id}`
  const worker = `/accounts/${zones[0].account.id}/workers/scripts/${ROUTER}`
  async function readState() {
    const [records, routes, ssl, deployments] = await Promise.all([
      api(`${zone}/dns_records?name=${HOST}&per_page=100`),
      api(`${zone}/workers/routes`),
      api(`${zone}/settings/ssl`),
      api(`${worker}/deployments`),
    ])
    return normalizeState({
      dns: records.filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type)),
      routes,
      ssl: ssl.value,
      deployment: deployments.deployments[0],
    })
  }
  if (mode === 'plan') {
    const plan = await buildPlan({
      state: await readState(),
      origin: first,
      probe: probeOrigin,
    })
    await writeFile(second, JSON.stringify(plan, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    })
    process.stdout.write(
      JSON.stringify(
        {
          ready: plan.ready,
          blockers: plan.blockers,
          verifiedAssets: plan.evidence?.assets.length || 0,
          plan: resolve(second),
        },
        null,
        2,
      ) + '\n',
    )
    if (!plan.ready) process.exitCode = 1
    return
  }
  const file = mode === 'apply' ? second : first
  if (mode === 'apply') {
    // Reserve the journal before any mutation. Existing recovery evidence must never be overwritten.
    await writeFile(file, '{}\n', { mode: 0o600, flag: 'wx' })
  }
  async function persist(journal) {
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(journal, null, 2) + '\n', {
      mode: 0o600,
    })
    await rename(temporary, file)
  }
  const ops = {
    readState,
    persist,
    probe: probeOrigin,
    verify: verifyBypass,
    verifyRestored: checkPublic,
    // Omit the optional script field to create a no-Worker route (Cloudflare API contract).
    createRoute: (pattern) =>
      api(`${zone}/workers/routes`, 'POST', { pattern }),
    removeRoute: (id) => {
      if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid route ID')
      return api(`${zone}/workers/routes/${id}`, 'DELETE')
    },
  }
  const saved = JSON.parse(await readFile(first, 'utf8'))
  if (mode === 'apply') await applyPlan(saved, ops)
  else {
    await rollbackRoutes(saved, ops)
  }
  process.stdout.write(`${mode} completed; evidence: ${resolve(file)}\n`)
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
