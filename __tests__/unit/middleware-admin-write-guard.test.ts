import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

// 管理 API の書き込み保護（CSRF）: 実物の NextRequest / NextResponse で middleware を通す
// 認証情報は合成値のみ
const basic = `Basic ${btoa('admin-user:admin-pass')}`
const SITE = 'https://nico-rank.com'
const VERCEL = 'https://nico-ranking-custom-yjsns-projects.vercel.app'

function request(url: string, method: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method, headers })
}

// NextResponse.next() は x-middleware-next ヘッダーで「先へ進める」を表す
const passedThrough = (res: Response): boolean => res.headers.get('x-middleware-next') === '1'

const sameOriginJson = { 'sec-fetch-site': 'same-origin', origin: SITE, 'content-type': 'application/json' }

describe('middleware: 管理 API の書き込み保護', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('ADMIN_USERNAME', 'admin-user')
    vi.stubEnv('ADMIN_PASSWORD', 'admin-pass')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('同一オリジン以外の書き込みは 403', () => {
    it('Sec-Fetch-Site が cross-site / same-site なら、認証済みでも止める', async () => {
      for (const site of ['cross-site', 'same-site']) {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
          const res = await middleware(request(`${SITE}/api/admin/lqng/allowlist`, method, { authorization: basic, 'content-type': 'application/json', 'sec-fetch-site': site }))
          expect(res.status).toBe(403)
        }
      }
    })

    it('Sec-Fetch-Site が無いときは Origin で判定する（別オリジン・opaque は 403）', async () => {
      for (const origin of ['https://evil.example', 'null', 'https://nico-rank.com.evil.example']) {
        const res = await middleware(request(`${SITE}/api/admin/ng-list`, 'POST', { authorization: basic, 'content-type': 'application/json', origin }))
        expect(res.status).toBe(403)
      }
    })

    it('管理 API なら /api/admin/update など対象を問わず止める', async () => {
      const res = await middleware(request(`${SITE}/api/admin/update`, 'POST', { authorization: basic, 'sec-fetch-site': 'cross-site' }))
      expect(res.status).toBe(403)
    })

    it('開発環境（認証を省く）でもクロスサイトの書き込みは止める', async () => {
      vi.stubEnv('VERCEL_ENV', 'development')
      expect((await middleware(request(`${SITE}/api/admin/lqng/config`, 'PUT', { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
      expect(passedThrough(await middleware(request(`${SITE}/api/admin/lqng/config`, 'PUT', sameOriginJson)))).toBe(true)
    })
  })

  describe('同一オリジンの書き込みは通し、Basic 認証は従来どおり', () => {
    it('認証が正しければ先へ進め、admin-auth クッキーを付ける', async () => {
      const res = await middleware(request(`${SITE}/api/admin/lqng/allowlist`, 'POST', { ...sameOriginJson, authorization: basic }))
      expect(passedThrough(res)).toBe(true)
      expect(res.headers.get('set-cookie')).toContain('admin-auth=authenticated')
    })

    it('認証が無い・誤りなら 401（WWW-Authenticate を返す）', async () => {
      const none = await middleware(request(`${SITE}/api/admin/lqng/allowlist`, 'POST', sameOriginJson))
      expect(none.status).toBe(401)
      expect(none.headers.get('www-authenticate')).toContain('Basic')
      const wrong = await middleware(request(`${SITE}/api/admin/lqng/allowlist`, 'POST', { ...sameOriginJson, authorization: `Basic ${btoa('admin-user:wrong')}` }))
      expect(wrong.status).toBe(401)
    })

    it('Worker 経由（Host が Vercel のドメイン）でも Sec-Fetch-Site: same-origin なら通す', async () => {
      const res = await middleware(request(`${VERCEL}/api/admin/lqng/allowlist`, 'POST', { ...sameOriginJson, host: new URL(VERCEL).host, authorization: basic }))
      expect(passedThrough(res)).toBe(true)
    })

    it('Sec-Fetch-Site が無くても、公開ドメインか自身のホストの Origin なら通す', async () => {
      const viaWorker = await middleware(request(`${VERCEL}/api/admin/ng-list`, 'POST', { origin: SITE, 'content-type': 'application/json', authorization: basic }))
      expect(passedThrough(viaWorker)).toBe(true)
      const direct = await middleware(request(`${VERCEL}/api/admin/ng-list`, 'POST', { origin: VERCEL, 'content-type': 'application/json', authorization: basic }))
      expect(passedThrough(direct)).toBe(true)
    })

    it('Origin も Sec-Fetch-Site も無い（ブラウザ以外）ときは認証の判定へ進む', async () => {
      const res = await middleware(request(`${SITE}/api/admin/ng-list`, 'POST', { 'content-type': 'application/json', authorization: basic }))
      expect(passedThrough(res)).toBe(true)
    })

    it('読み取り（GET）はこの判定の対象外', async () => {
      const res = await middleware(request(`${SITE}/api/admin/lqng/overview`, 'GET', { 'sec-fetch-site': 'cross-site', authorization: basic }))
      expect(passedThrough(res)).toBe(true)
    })

    it('管理 API 以外は対象外', async () => {
      const res = await middleware(request(`${SITE}/api/search`, 'POST', { 'sec-fetch-site': 'cross-site' }))
      expect(passedThrough(res)).toBe(true)
    })
  })

  describe('管理 NG API の書き込みは JSON 以外を 415', () => {
    it('Content-Type が application/json でなければ 415', async () => {
      const cases: Array<[string, string, Record<string, string>]> = [
        ['/api/admin/lqng/allowlist', 'POST', { 'content-type': 'text/plain' }],
        ['/api/admin/lqng/config', 'PUT', {}],
        ['/api/admin/ng-list', 'POST', { 'content-type': 'application/x-www-form-urlencoded' }],
        ['/api/admin/ng-list/derived/sm1', 'DELETE', {}],
        ['/api/admin/ng-list/derived/bulk', 'POST', { 'content-type': 'multipart/form-data; boundary=x' }],
      ]
      for (const [path, method, headers] of cases) {
        const res = await middleware(request(`${SITE}${path}`, method, { 'sec-fetch-site': 'same-origin', authorization: basic, ...headers }))
        expect(res.status).toBe(415)
      }
    })

    it('application/json（charset 付きを含む）は通す', async () => {
      for (const contentType of ['application/json', 'application/json; charset=utf-8', 'Application/JSON']) {
        const res = await middleware(request(`${SITE}/api/admin/ng-list/derived/sm1`, 'DELETE', { 'sec-fetch-site': 'same-origin', authorization: basic, 'content-type': contentType }))
        expect(passedThrough(res)).toBe(true)
      }
    })

    it('本文なしの POST を送る既存の管理 API（/api/admin/update・/api/admin/mfa/setup）は 415 の対象外', async () => {
      for (const path of ['/api/admin/update', '/api/admin/mfa/setup']) {
        const res = await middleware(request(`${SITE}${path}`, 'POST', { 'sec-fetch-site': 'same-origin', authorization: basic }))
        expect(passedThrough(res)).toBe(true)
      }
    })
  })
})
