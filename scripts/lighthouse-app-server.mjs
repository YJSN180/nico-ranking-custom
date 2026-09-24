#!/usr/bin/env node
// Lighthouse CI で計測するアプリを、固定のランキングデータで起動する。
//
// トップページは SSR で `${NEXT_PUBLIC_SITE_URL}/api/ranking` からランキングを取得する。
// 既定の取得先は本番で、最終的に nico-rank.com へリダイレクトされる。GitHub Actions の
// runner からは Bot Fight Mode で 403 になり、データのないエラーページを計測してしまう。
// そこで、この API の代わりに固定データを返すサーバーを 127.0.0.1 に立て、SSR の取得先を
// そこへ向けて `next start` を起動する。本番の WAF や Bot 対策は回避しない。
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'

const fixturePort = Number(process.env.LHCI_FIXTURE_PORT || 4010)
const appPort = process.env.PORT || '3000'

const popularTags = ['ゲーム', '実況プレイ動画', 'VOCALOID']
const items = Array.from({ length: 100 }, (_, index) => ({
  rank: index + 1,
  id: `sm${45000000 + index}`,
  title: `Lighthouse 計測用の動画 ${index + 1}`,
  thumbURL: '/cantwatch.jpg',
  views: 300000 - index * 2500,
  comments: 4000 - index * 30,
  mylists: 900 - index * 7,
  likes: 6000 - index * 50,
  tags: popularTags,
  authorId: String(100000 + index),
  authorName: `投稿者 ${index + 1}`,
  registeredAt: '2026-09-01T12:00:00+09:00',
  duration: 480,
}))
const rankingBody = JSON.stringify({ items, popularTags })

const fixture = createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (request.method === 'GET' && pathname === '/api/ranking') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(rankingBody)
    return
  }
  response.writeHead(404)
  response.end()
})

fixture.listen(fixturePort, '127.0.0.1', () => {
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')
  const app = spawn(process.execPath, [nextBin, 'start', '-p', appPort], {
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${fixturePort}` },
  })
  const stop = () => app.kill('SIGTERM')
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  app.on('exit', (code, signal) => {
    fixture.close()
    fixture.closeAllConnections()
    process.exitCode = code ?? (signal ? 1 : 0)
  })
})
