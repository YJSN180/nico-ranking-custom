// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
  DIAGNOSTIC_HEADERS,
  BODY_EXCERPT_LENGTH,
  MAX_ATTEMPTS,
  isRetryableStatus,
  retryDelayMs,
  fetchWithRetry,
  collapseWhitespace,
  githubWarning,
  pickDiagnosticHeaders,
  describeResponse,
  countVideoLinks,
  emptyRankingReason,
  adminDenialProblem,
  checkPublicGateway,
} from '../../../scripts/lib/gateway-check.mjs'

const response = (status, headers = {}, body = '') =>
  new Response(body, { status, headers })
const noSleep = () => Promise.resolve()

describe('診断の出力', () => {
  const challenge = () =>
    response(
      403,
      {
        server: 'cloudflare',
        'cf-ray': '8c0ffee-NRT',
        'cf-mitigated': 'challenge',
        'content-type': 'text/html; charset=UTF-8',
        'set-cookie': '__cf_bm=secret-cookie; HttpOnly',
        'www-authenticate': 'Basic realm="Admin Area"',
        authorization: 'Basic c2VjcmV0',
        'x-worker-auth': 'secret-worker-key',
        'cf-connecting-ip': '192.0.2.1',
      },
      '<!DOCTYPE html>\n<html>\n  <head><title>Just a moment...</title></head>\n</html>',
    )

  it('許可したヘッダーだけを出し、Cookie や認証ヘッダーは出さない', async () => {
    const res = challenge()
    // 除外を確かめる前提として、応答には機微なヘッダーが実際に載っている
    expect(res.headers.get('set-cookie')).not.toBeNull()
    expect(res.headers.get('authorization')).not.toBeNull()
    const text = describeResponse('Ranking SSR /', res, await res.text())

    expect(text).toContain('Ranking SSR /: HTTP 403')
    expect(text).toContain('  server: cloudflare')
    expect(text).toContain('  cf-ray: 8c0ffee-NRT')
    expect(text).toContain('  cf-mitigated: challenge')
    expect(text).toContain('Cloudflare mitigated the request at the edge')
    for (const leaked of [
      'secret-cookie',
      'set-cookie',
      'Basic realm',
      'c2VjcmV0',
      'secret-worker-key',
      '192.0.2.1',
    ]) {
      expect(text).not.toContain(leaked)
    }
    expect(DIAGNOSTIC_HEADERS).not.toContain('set-cookie')
    expect(DIAGNOSTIC_HEADERS).not.toContain('www-authenticate')
  })

  it('本文は空白を潰して 1 行・先頭 200 文字に切り詰める', async () => {
    const res = challenge()
    const text = describeResponse('Ranking SSR /', res, await res.text())
    const bodyLine = text
      .split('\n')
      .find((line) => line.startsWith('  body: '))

    expect(bodyLine).toBe(
      '  body: <!DOCTYPE html> <html> <head><title>Just a moment...</title></head> </html>',
    )
    const long = `${'a'.repeat(150)}\n\n::error::${'b'.repeat(150)}`
    const collapsed = collapseWhitespace(long, BODY_EXCERPT_LENGTH)
    expect(collapsed).toHaveLength(BODY_EXCERPT_LENGTH)
    expect(collapsed).not.toContain('\n')
  })

  it('本文を渡さない応答（HEAD・管理 API）では本文の行を出さない', () => {
    const text = describeResponse(
      'Gateway check /api/admin/ng-list: expected HTTP 401',
      response(200, { 'content-type': 'application/json' }),
    )
    expect(text).not.toContain('body:')
  })

  it('リダイレクト先のクエリを落とす', () => {
    const headers = new Headers({
      location: 'https://vercel.com/sso-api?url=x&nonce=one-time-token',
    })
    expect(pickDiagnosticHeaders(headers)).toEqual([
      ['location', 'https://vercel.com/sso-api?…'],
    ])
  })

  it('Vercel の緩和も示す', () => {
    const text = describeResponse(
      'Ranking SSR /',
      response(403, {
        'x-vercel-mitigated': 'challenge',
        'x-vercel-id': 'hnd1::abc',
      }),
      '',
    )
    expect(text).toContain('  x-vercel-id: hnd1::abc')
    expect(text).toContain('Vercel mitigated the request')
  })
})

describe('再試行の方針', () => {
  it('HTTP では 429 だけを再試行し、5xx と 403 は再試行しない', () => {
    expect(isRetryableStatus(429)).toBe(true)
    for (const status of [200, 401, 403, 404, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(false)
    }
  })

  it('指数的に待ち、数値の Retry-After には上限付きで従う', () => {
    expect(retryDelayMs(1)).toBe(2000)
    expect(retryDelayMs(2)).toBe(4000)
    expect(retryDelayMs(1, '5')).toBe(5000)
    expect(retryDelayMs(1, '3600')).toBe(30000)
    expect(retryDelayMs(2, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBe(4000)
  })

  it('403 は再試行せずにそのまま返す', async () => {
    const fetchImpl = vi.fn(async () => response(403, {}, 'blocked'))
    const res = await fetchWithRetry(
      'https://example.test/',
      {},
      {
        fetchImpl,
        sleep: noSleep,
      },
    )
    expect(res.status).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('503 は後に成功する応答があっても再試行せず、そのまま返す', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(503, {}, 'error code: 1102'))
      .mockResolvedValueOnce(response(200, {}, 'ok'))
    const onRetry = vi.fn()
    const res = await fetchWithRetry(
      'https://example.test/',
      {},
      { fetchImpl, sleep: noSleep, onRetry },
    )
    expect(res.status).toBe(503)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('429 の後に成功すれば成功を返し、捨てた応答の診断と待ち時間を通知する', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          429,
          {
            'retry-after': '1',
            'cf-ray': 'abc-NRT',
            'content-type': 'text/plain',
          },
          'rate limited',
        ),
      )
      .mockResolvedValueOnce(response(200, {}, 'ok'))
    const sleep = vi.fn(noSleep)
    const onRetry = vi.fn()
    const res = await fetchWithRetry(
      'https://example.test/',
      {},
      { fetchImpl, sleep, onRetry },
    )
    expect(res.status).toBe(200)
    expect(sleep).toHaveBeenCalledWith(1000)
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 1,
      delay: 1000,
      diagnostic:
        'Discarded response: HTTP 429\n  cf-ray: abc-NRT\n  content-type: text/plain\n  body: rate limited',
    })
  })

  it('HEAD で 429 を捨てるときは本文を読まない', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, {}, 'should not be read'))
      .mockResolvedValueOnce(response(401))
    const onRetry = vi.fn()
    await fetchWithRetry(
      'https://example.test/',
      { method: 'HEAD' },
      { fetchImpl, sleep: noSleep, onRetry },
    )
    expect(onRetry.mock.calls[0][0].diagnostic).not.toContain('body:')
  })

  it('429 が続けば最後の応答を返す', async () => {
    const fetchImpl = vi.fn(async () => response(429))
    const res = await fetchWithRetry(
      'https://example.test/',
      {},
      {
        fetchImpl,
        sleep: noSleep,
      },
    )
    expect(res.status).toBe(429)
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS)
  })

  it('ネットワークエラーは再試行し、続けば原因付きで失敗する', async () => {
    const networkError = () =>
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error('read ECONNRESET'),
      })
    const fetchImpl = vi.fn(async () => {
      throw networkError()
    })
    await expect(
      fetchWithRetry(
        'https://example.test/',
        {},
        { fetchImpl, sleep: noSleep },
      ),
    ).rejects.toThrow(
      `https://example.test/: request failed after ${MAX_ATTEMPTS} attempts: TypeError: fetch failed: read ECONNRESET`,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS)
  })

  it('タイムアウトは再試行せずに失敗する', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      )
    })
    await expect(
      fetchWithRetry(
        'https://example.test/',
        {},
        { fetchImpl, sleep: noSleep, timeoutMs: 30000 },
      ),
    ).rejects.toThrow('https://example.test/: no response within 30000 ms')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('試行ごとに新しいタイムアウトを付け、呼び出し側の設定を保つ', async () => {
    const fetchImpl = vi.fn(async () => response(200))
    await fetchWithRetry(
      'https://example.test/',
      { method: 'HEAD', redirect: 'manual' },
      { fetchImpl, sleep: noSleep, timeoutMs: 15000 },
    )
    const init = fetchImpl.mock.calls[0][1]
    expect(init.method).toBe('HEAD')
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('ランキングの判定', () => {
  const page = (body) => `<html><body>${body}</body></html>`

  it('動画リンクがあれば空ではない', () => {
    const html = page(
      '<a href="https://www.nicovideo.jp/watch/sm45000001">a</a>' +
        '<a href="https://www.nicovideo.jp/watch/sm45000001">a</a>' +
        '<a href="https://www.nicovideo.jp/watch/so12345">b</a>',
    )
    expect(emptyRankingReason(html)).toBeNull()
    expect(countVideoLinks(html)).toBe(2)
  })

  it('空のランキングの表示は 200 でも空と判定する', () => {
    expect(
      emptyRankingReason(
        page(
          'ランキングデータがありません<a href="https://www.nicovideo.jp/watch/sm1">a</a>',
        ),
      ),
    ).toBe('shows the empty-ranking message')
  })

  it('動画リンクが無ければ空と判定する', () => {
    expect(emptyRankingReason(page('<main></main>'))).toBe(
      'contains no video links',
    )
  })
})

describe('管理 API の拒否の判定', () => {
  it('401・認証要求・no-store がそろえば合格', () => {
    expect(
      adminDenialProblem(
        response(401, {
          'www-authenticate': 'Basic realm="Admin Area"',
          'cache-control': 'no-store, must-revalidate',
        }),
      ),
    ).toBeNull()
  })

  it('401 以外・認証要求なし・キャッシュ可は不合格', () => {
    expect(adminDenialProblem(response(200))).toBe('expected HTTP 401')
    expect(
      adminDenialProblem(response(401, { 'cache-control': 'no-store' })),
    ).toBe('missing WWW-Authenticate challenge')
    expect(
      adminDenialProblem(
        response(401, {
          'www-authenticate': 'Basic realm="Admin Area"',
          'cache-control': 'public, max-age=60',
        }),
      ),
    ).toBe('Cache-Control does not include no-store')
  })
})

describe('チェック全体（デプロイ後のゲート）', () => {
  const rankingPage = () =>
    response(
      200,
      { 'content-type': 'text/html' },
      '<a href="https://www.nicovideo.jp/watch/sm45000001">a</a>',
    )
  const adminDenial = () =>
    response(401, {
      'www-authenticate': 'Basic realm="Admin Area"',
      'cache-control': 'no-store',
    })
  const run = (fetchImpl) => {
    const log = vi.fn()
    return {
      log,
      result: checkPublicGateway({ fetchImpl, sleep: noSleep, log }),
    }
  }

  it('SSR 2 ページと管理 API の拒否を確かめて合格する', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(adminDenial())
    const { log, result } = run(fetchImpl)
    await expect(result).resolves.toBeUndefined()

    expect(
      fetchImpl.mock.calls.map(([url, init]) => [String(url), init.method]),
    ).toEqual([
      ['https://nico-rank.com/', undefined],
      ['https://nico-rank.com/?genre=game&period=24h', undefined],
      ['https://nico-rank.com/api/admin/ng-list', 'HEAD'],
    ])
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toBe(
      'nico-ranking-verification/1.0',
    )
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      'Verified Ranking SSR /: 1 video links',
      'Verified Ranking SSR /?genre=game&period=24h: 1 video links',
      'Verified /api/admin/ng-list: 401 with authentication challenge and no-store',
    ])
  })

  it('配備直後の 503 は、次に 200 が返るとしても cf-ray と本文付きで失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          503,
          {
            server: 'cloudflare',
            'cf-ray': '8c0ffee-NRT',
            'content-type': 'text/plain',
          },
          'error code: 1102',
        ),
      )
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(adminDenial())
    const { log, result } = run(fetchImpl)

    await expect(result).rejects.toThrow(
      [
        'Ranking SSR /: HTTP 503',
        '  server: cloudflare',
        '  cf-ray: 8c0ffee-NRT',
        '  content-type: text/plain',
        '  body: error code: 1102',
      ].join('\n'),
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
  })

  it('再試行で合格したときも、捨てた失敗を 1 行の ::warning:: 注釈に残す', async () => {
    const networkError = Object.assign(new TypeError('fetch failed'), {
      cause: new Error('read ECONNRESET'),
    })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          429,
          { 'cf-ray': 'abc-NRT', 'content-type': 'text/plain' },
          '100% busy',
        ),
      )
      .mockResolvedValueOnce(rankingPage())
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(adminDenial())
    const { log, result } = run(fetchImpl)
    await expect(result).resolves.toBeUndefined()

    const warnings = log.mock.calls
      .map(([line]) => line)
      .filter((line) => line.startsWith('::warning::'))
    expect(warnings).toEqual([
      '::warning::Ranking SSR /: attempt 1 failed; retrying in 2000 ms%0ADiscarded response: HTTP 429%0A  cf-ray: abc-NRT%0A  content-type: text/plain%0A  body: 100%25 busy',
      '::warning::Ranking SSR /?genre=game&period=24h: attempt 1 failed; retrying in 2000 ms%0ATypeError: fetch failed: read ECONNRESET',
    ])
  })
})

describe('GitHub Actions の注釈', () => {
  it('% と改行をエスケープして 1 行にする', () => {
    const line = githubWarning('a%b\r\n::error::c')
    expect(line).toBe('::warning::a%25b%0D%0A::error::c')
    expect(line).not.toMatch(/[\r\n]/)
  })
})
