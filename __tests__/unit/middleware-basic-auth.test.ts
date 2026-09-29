// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

// 管理画面・管理 API の Basic 認証。資格情報は合成値のみ
const SITE = 'https://nico-rank.com'
const USERNAME = 'synthetic-admin'
const PASSWORD = 'synthetic:pass:with:colons'

const basic = (credentials: string) => `Basic ${btoa(credentials)}`
const adminGet = (authorization?: string) =>
  middleware(new NextRequest(`${SITE}/api/admin/lqng/overview`, { headers: authorization ? { authorization } : {} }))
const passedThrough = (res: Response): boolean => res.headers.get('x-middleware-next') === '1'

describe('middleware: Basic 認証', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('ADMIN_USERNAME', USERNAME)
    vi.stubEnv('ADMIN_PASSWORD', PASSWORD)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('パスワードに : を含められる（資格情報は最初の : だけで分ける）', async () => {
    const res = await adminGet(basic(`${USERNAME}:${PASSWORD}`))

    expect(passedThrough(res)).toBe(true)
    expect(res.headers.get('set-cookie')).toContain('admin-auth=')
  })

  it.each([
    ['パスワードが違う', `${USERNAME}:synthetic:pass:with:colon`],
    ['ユーザー名が違う', `synthetic-admiN:${PASSWORD}`],
    ['パスワードの前方だけ一致', `${USERNAME}:synthetic`],
    [': が無い', `${USERNAME}${PASSWORD}`],
    ['空', ''],
  ])('%s なら 401', async (_label, credentials) => {
    const res = await adminGet(basic(credentials))

    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('Basic')
  })

  it('ユーザー名が違っても、パスワードの比較を省かない（どちらが違ったかを時間で漏らさない）', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest')

    await adminGet(basic(`synthetic-other:${PASSWORD}`))
    const wrongUsername = digest.mock.calls.length
    digest.mockClear()
    await adminGet(basic(`${USERNAME}:synthetic-other`))
    const wrongPassword = digest.mock.calls.length

    // ユーザー名とパスワードのそれぞれで、送られた値と正しい値をハッシュして比べる
    expect(wrongUsername).toBe(4)
    expect(wrongPassword).toBe(4)
  })

  it('書き込みの同一オリジン判定は従来どおり認証より先（資格情報が正しくてもクロスサイトは 403）', async () => {
    const res = await middleware(
      new NextRequest(`${SITE}/api/admin/lqng/allowlist`, {
        method: 'POST',
        headers: {
          authorization: basic(`${USERNAME}:${PASSWORD}`),
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
      })
    )

    expect(res.status).toBe(403)
  })
})
