// Read-only smoke check: public SSR must contain videos, not just return HTTP 200.
// Admin response bodies are never read and no admin data is submitted.
for (const path of ['/', '/?genre=game&period=24h']) {
  const response = await fetch(new URL(path, 'https://nico-rank.com'), {
    signal: AbortSignal.timeout(30000),
  })
  if (response.status !== 200) throw new Error(`Ranking SSR ${path}: ${response.status}`)
  const html = await response.text()
  if (html.includes('ランキングデータがありません') || !html.includes('nicovideo.jp/watch/')) {
    throw new Error(`Ranking SSR ${path} returned an empty ranking`)
  }
  console.log(`Verified ranking SSR ${path}: video links present`)
}
const paths = ['/api/admin/ng-list']
for (const path of paths) {
  const response = await fetch(new URL(path, 'https://nico-rank.com'), { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) })
  await response.body?.cancel()
  const expected = 401
  if (response.status !== expected) throw new Error(`Gateway check ${path}: ${response.status}, expected ${expected}`)
  if (path !== '/' && (!response.headers.get('www-authenticate') || !response.headers.get('cache-control')?.includes('no-store'))) throw new Error('Admin denial must challenge authentication and disable caching')
  console.log(`Verified ${path}: ${response.status}`)
}
