const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn } = require('node:child_process')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const healthy = '<!doctype html><html lang="ja"><head><title>Fixture</title></head><body><header><button aria-label="メニュー">Menu</button></header><main><h1>Ranking</h1><article data-testid="ranking-item"><a href="https://www.nicovideo.jp/watch/sm1">Fixture video</a></article></main></body></html>'

for (const [name, status, html, expectedSuccess, grep, count] of [
  ['healthy rendering and optional checks', 200, healthy, true, '.*', 4],
  ['empty rendering despite HTTP 200', 200, healthy.replace(/<article.*<\/article>/, '<p>ランキングデータがありません</p>'), false, '@smoke', 2],
  ['HTTP 403', 403, healthy, false, '@smoke', 2],
  ['serious accessibility violation', 200, healthy.replace('</main>', '<button style="width:40px;height:40px"></button></main>'), false, '@accessibility', 1],
]) {
  test(`actual Chromium monitoring: ${name}`, { timeout: 90_000 }, async t => {
    const requests = []
    const server = http.createServer((req, res) => {
      requests.push(req.method)
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test',
        '--config=playwright.monitoring.config.ts', '--project=chromium', '--grep=' + grep,
        '--output=' + path.join(root, 'test-results', name.replaceAll(' ', '-'))], {
        cwd: root, env: { ...process.env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${server.address().port}` },
      })
      let output = ''
      child.stdout.on('data', chunk => { output += chunk })
      child.stderr.on('data', chunk => { output += chunk })
      child.on('close', code => resolve({ code, output }))
    })
    assert.equal(result.code === 0, expectedSuccess, result.output)
    assert.match(result.output, new RegExp(`Running ${count} test`))
    assert.ok(requests.length > 0)
    assert.ok(requests.every(method => method === 'GET'))
  })
}
