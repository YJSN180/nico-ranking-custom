const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')
const root = path.resolve(__dirname, '../..')
const workflow = yaml.load(readFileSync(path.join(root, '.github/workflows/e2e-monitoring.yml'), 'utf8'))

function run(command, args, env = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env } })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('close', code => resolve({ code, output }))
  })
}

async function fixture(t, status, body) {
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url })
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(body)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return { url: `http://127.0.0.1:${server.address().port}`, requests }
}

for (const [name, status, body, expected] of [
  ['valid ranking', 200, '{"items":[{"id":"sm1","title":"Fixture"}]}', 0],
  ['empty ranking', 200, '{"items":[]}', 1],
  ['wrong shape', 200, '{"ok":true}', 1],
  ['invalid JSON', 200, '<html>Login</html>', 1],
  ['missing video fields', 200, '{"items":[{}]}', 1],
  ['forbidden', 403, '{}', 1],
  ['not found', 404, '{}', 1],
  ['server failure', 500, '{}', 1],
]) {
  test(`public health probe: ${name}`, async t => {
    const f = await fixture(t, status, body)
    // Execute the actual workflow command, with only its URL changed to loopback.
    const command = workflow.jobs['smoke-tests'].steps.find(s => s.id === 'api-health').run
    const result = await run('bash', ['-e', '-c', command], { HEALTH_CHECK_BASE_URL: f.url })
    assert.equal(result.code, expected, result.output)
    assert.deepEqual(f.requests, [{ method: 'GET', url: '/api/ranking?genre=all&period=24h' }])
  })
}

test('connection failure is not healthy', async t => {
  const f = await fixture(t, 200, '{}')
  // A refused local connection is deterministic and does not contact production.
  const result = await run('bash', ['scripts/health-check.sh', 'prod'], { HEALTH_CHECK_BASE_URL: 'http://127.0.0.1:1' })
  assert.notEqual(result.code, 0, result.output)
  assert.equal(f.requests.length, 0)
})

test('scheduled failures remain failures and API runs after a smoke failure', () => {
  const steps = workflow.jobs['smoke-tests'].steps
  for (const id of ['smoke-tests', 'api-health', 'performance', 'accessibility']) {
    assert.notEqual(steps.find(s => s.id === id)['continue-on-error'], true)
  }
  assert.equal(steps.find(s => s.id === 'api-health').if, '${{ !cancelled() }}')
  assert.equal(steps.find(s => s.uses === 'actions/github-script@v7').if, 'failure()')
  assert.deepEqual(workflow.on.schedule, [{ cron: '0 */4 * * *' }])
  assert.match(workflow.jobs['manual-comprehensive'].if, /workflow_dispatch.*full/)
  assert.doesNotMatch(JSON.stringify(workflow), /github\.event\.schedule/)
})

for (const [priorFailures, alreadyOpen, expectedCreates] of [[0, false, 0], [1, false, 0], [2, false, 1], [2, true, 0]]) {
  test(`notification dry run: prior=${priorFailures}, existing=${alreadyOpen}`, async () => {
    const script = workflow.jobs['smoke-tests'].steps.find(s => s.uses === 'actions/github-script@v7').with.script
    const calls = []
    const github = { rest: {
      actions: { listWorkflowRuns: async () => ({ data: { workflow_runs: [
        ...Array.from({ length: priorFailures }, (_, id) => ({ id, conclusion: 'failure' })),
        { id: 90, conclusion: 'success' }, { id: 99, conclusion: 'failure' },
      ] } }) },
      issues: {
        listForRepo: async () => ({ data: alreadyOpen ? [{ number: 1 }] : [] }),
        create: async input => { calls.push(input) },
      },
    } }
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    await new AsyncFunction('github', 'context', script)(github, {
      repo: { owner: 'fixture', repo: 'fixture' }, runId: 99, serverUrl: 'https://example.invalid',
    })
    assert.equal(calls.length, expectedCreates)
    if (calls.length) assert.match(calls[0].body, /actions\/runs\/99/)
  })
}
