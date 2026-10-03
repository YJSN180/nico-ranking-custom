import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

// /sw.js（Service Worker 本体）は長期キャッシュしない。
// ページ遷移を横取りする SW に不具合があったとき、修正版がすぐ届くようにするため
describe('middleware: Service Worker スクリプトのキャッシュ', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('/sw.js はブラウザが毎回再検証し、CDN には保存させない', async () => {
    const res = await middleware(new NextRequest('https://nico-rank.com/sw.js'))

    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8')
  })

  it('ほかの .js は従来どおり 24 時間キャッシュする', async () => {
    const res = await middleware(new NextRequest('https://nico-rank.com/some-script.js'))

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400')
    expect(res.headers.get('CDN-Cache-Control')).toBe('public, s-maxage=86400, must-revalidate')
  })
})
