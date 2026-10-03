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
  isEdgeChallenge,
  rankingPayloadProblem,
  checkDeployedWorker,
  checkPublicGateway,
  runSmokeCheck,
  WORKERS_DEV_ORIGINS,
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
    await expect(result).resolves.toEqual({
      verified: [
        'Ranking SSR /',
        'Ranking SSR /?genre=game&period=24h',
        'Gateway check /api/admin/ng-list',
      ],
      challenged: [],
    })

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
    await expect(result).resolves.toMatchObject({ challenged: [] })

    const warnings = log.mock.calls
      .map(([line]) => line)
      .filter((line) => line.startsWith('::warning::'))
    expect(warnings).toEqual([
      '::warning::Ranking SSR /: attempt 1 failed; retrying in 2000 ms%0ADiscarded response: HTTP 429%0A  cf-ray: abc-NRT%0A  content-type: text/plain%0A  body: 100%25 busy',
      '::warning::Ranking SSR /?genre=game&period=24h: attempt 1 failed; retrying in 2000 ms%0ATypeError: fetch failed: read ECONNRESET',
    ])
  })
})

describe('公開ドメインのチャレンジ（GitHub runner）', () => {
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
  // run 37133622281 で runner が受け取った応答と同じ形
  const challenge = () =>
    response(
      403,
      {
        server: 'cloudflare',
        'cf-ray': '8c0ffee-IAD',
        'cf-mitigated': 'challenge',
        'content-type': 'text/html; charset=UTF-8',
      },
      '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>',
    )
  const run = (fetchImpl) => {
    const log = vi.fn()
    return {
      log,
      result: checkPublicGateway({ fetchImpl, sleep: noSleep, log }),
    }
  }
  const warningsOf = (log) =>
    log.mock.calls
      .map(([line]) => line)
      .filter((line) => line.startsWith('::warning::'))

  it('cf-mitigated の応答は失敗にせず、手動確認を促す警告を出して残りを確かめる', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(adminDenial())
    const { log, result } = run(fetchImpl)

    await expect(result).resolves.toEqual({
      verified: [
        'Ranking SSR /?genre=game&period=24h',
        'Gateway check /api/admin/ng-list',
      ],
      challenged: ['Ranking SSR /'],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const warnings = warningsOf(log)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(
      /^::warning::Public edge not verified: Cloudflare challenged Ranking SSR \/ at the nico-rank.com edge, as it does for GitHub runners\. Verify https:\/\/nico-rank\.com manually from an unauthenticated browser or a residential network/,
    )
    expect(warnings[0]).toContain('%0ARanking SSR /: HTTP 403')
    expect(warnings[0]).toContain('cf-ray: 8c0ffee-IAD')
    expect(warnings[0]).not.toMatch(/[\r\n]/)
  })

  it('すべてチャレンジされても失敗にせず、確かめられなかったものを返す。チャレンジは再試行しない', async () => {
    const fetchImpl = vi.fn(async () => challenge())
    const { log, result } = run(fetchImpl)

    await expect(result).resolves.toEqual({
      verified: [],
      challenged: [
        'Ranking SSR /',
        'Ranking SSR /?genre=game&period=24h',
        'Gateway check /api/admin/ng-list',
      ],
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(warningsOf(log)).toHaveLength(3)
    // 管理 API の HEAD は本文を出さない
    expect(warningsOf(log)[2]).not.toContain('body:')
  })

  it('cf-mitigated の無い 403 は従来どおり失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(403, { server: 'cloudflare', 'cf-ray': 'abc-NRT' }, 'denied'),
      )
      .mockImplementation(async () => rankingPage())
    const { result } = run(fetchImpl)

    await expect(result).rejects.toThrow(
      'Ranking SSR /: HTTP 403\n  server: cloudflare\n  cf-ray: abc-NRT\n  content-type: text/plain;charset=UTF-8\n  body: denied',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('Vercel のチャレンジ（x-vercel-mitigated）は緩めずに失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(
        response(403, { 'x-vercel-mitigated': 'challenge' }),
      )
    const { result } = run(fetchImpl)

    await expect(result).rejects.toThrow(
      'Gateway check /api/admin/ng-list: expected HTTP 401',
    )
  })

  it('チャレンジされなかった管理 API が 200 なら失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(response(200, { 'cache-control': 'no-store' }))
    const { result } = run(fetchImpl)

    await expect(result).rejects.toThrow(
      'Gateway check /api/admin/ng-list: expected HTTP 401',
    )
  })

  it('403・cf-mitigated: challenge・x-router-version 無しだけをエッジのチャレンジとみなす', () => {
    const router = { 'x-router-version': 'smart-router-20250706-bfcache-fix' }
    expect(isEdgeChallenge(challenge())).toBe(true)
    expect(
      isEdgeChallenge(response(403, { 'cf-mitigated': 'Challenge' })),
    ).toBe(true)
    expect(isEdgeChallenge(response(403))).toBe(false)
    // ルーターを通った応答（上流の cf-mitigated を引き継いだもの）
    expect(
      isEdgeChallenge(
        response(403, { 'cf-mitigated': 'challenge', ...router }),
      ),
    ).toBe(false)
    // 403 以外
    for (const status of [200, 401, 429, 502, 503]) {
      expect(
        isEdgeChallenge(response(status, { 'cf-mitigated': 'challenge' })),
      ).toBe(false)
    }
    // challenge 以外の値
    expect(isEdgeChallenge(response(403, { 'cf-mitigated': 'block' }))).toBe(
      false,
    )
  })

  it('ルーターを通った cf-mitigated 付きの 403 は警告にせず失敗にし、ルーターより前とは書かない', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          403,
          {
            'cf-mitigated': 'challenge',
            'x-router-version': 'smart-router-20250706-bfcache-fix',
          },
          'Just a moment...',
        ),
      )
      .mockImplementation(async () => rankingPage())
    const { log, result } = run(fetchImpl)

    const error = await result.then(
      () => null,
      (rejection) => rejection,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toMatch(/^Ranking SSR \/: HTTP 403\n/)
    expect(error.message).toContain(
      'hint: cf-mitigated=challenge is present, but this is not a Cloudflare edge challenge',
    )
    expect(error.message).not.toContain('before the router Worker')
    expect(warningsOf(log)).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('cf-mitigated: block の 403 は警告にせず失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(403, { 'cf-mitigated': 'block' }, 'blocked'),
      )
      .mockImplementation(async () => rankingPage())
    const { log, result } = run(fetchImpl)

    await expect(result).rejects.toThrow(/^Ranking SSR \/: HTTP 403\n/)
    expect(warningsOf(log)).toEqual([])
  })

  it('cf-mitigated が付いた 200 の空画面は空ランキングとして失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          200,
          {
            'cf-mitigated': 'challenge',
            'x-router-version': 'smart-router-20250706-bfcache-fix',
          },
          '<html>ランキングデータがありません</html>',
        ),
      )
      .mockImplementation(async () => rankingPage())
    const { log, result } = run(fetchImpl)

    await expect(result).rejects.toThrow(
      'Ranking SSR / returned an empty ranking (shows the empty-ranking message): HTTP 200',
    )
    expect(warningsOf(log)).toEqual([])
  })

  it('ルーター経由の 502 や管理 API の 200 は、cf-mitigated が付いていても失敗にする', async () => {
    const routed = {
      'cf-mitigated': 'block',
      'x-router-version': 'smart-router-20250706-bfcache-fix',
    }
    const ssr502 = vi.fn(async () => response(502, routed, 'Gateway Error'))
    const ssr = run(ssr502)
    await expect(ssr.result).rejects.toThrow(
      /^Ranking SSR \/: HTTP 502\n[\s\S]*body: Gateway Error$/,
    )
    expect(warningsOf(ssr.log)).toEqual([])

    // 認証が効かずに 200 が返った管理 API。ルーターは管理パスに x-router-version を付けない
    const adminOpen = vi
      .fn()
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(rankingPage())
      .mockResolvedValueOnce(
        response(200, {
          'cf-mitigated': 'challenge',
          'cache-control': 'no-store',
        }),
      )
    const admin = run(adminOpen)
    await expect(admin.result).rejects.toThrow(
      'Gateway check /api/admin/ng-list: expected HTTP 401: HTTP 200',
    )
    expect(warningsOf(admin.log)).toEqual([])
  })
})

describe('ランキング API の JSON の判定', () => {
  const payload = (overrides = {}) => ({
    items: [{ id: 'sm45000001', title: 'a' }],
    metadata: {
      version: 1,
      updatedAt: '2026-10-03T14:24:05.859Z',
      genre: 'all',
      period: '24h',
    },
    ...overrides,
  })

  it('動画が並び、metadata が要求と合えば合格', () => {
    expect(rankingPayloadProblem(payload(), 'all', '24h')).toBeNull()
  })

  it('items が無い・空・動画 ID が無いものは不合格', () => {
    expect(rankingPayloadProblem({}, 'all', '24h')).toBe(
      'items is not an array',
    )
    expect(rankingPayloadProblem(null, 'all', '24h')).toBe(
      'items is not an array',
    )
    expect(rankingPayloadProblem(payload({ items: [] }), 'all', '24h')).toBe(
      'items is empty',
    )
    expect(
      rankingPayloadProblem(payload({ items: [{ id: 42 }] }), 'all', '24h'),
    ).toBe('items contain no video ids')
  })

  it('metadata が要求と違う・更新日時が読めないものは不合格', () => {
    expect(
      rankingPayloadProblem(payload({ metadata: undefined }), 'all', '24h'),
    ).toBe('metadata does not match genre=all period=24h')
    expect(
      rankingPayloadProblem(
        payload({
          metadata: { genre: 'game', period: '24h', updatedAt: '2026-10-03' },
        }),
        'all',
        '24h',
      ),
    ).toBe('metadata does not match genre=all period=24h')
    expect(
      rankingPayloadProblem(
        payload({
          metadata: { genre: 'all', period: '24h', updatedAt: 'soon' },
        }),
        'all',
        '24h',
      ),
    ).toBe('metadata.updatedAt is not a date')
  })
})

describe('配備した Worker の直接確認（workers.dev）', () => {
  const GREEN = 'nico-ranking-api-gateway-green'
  const GREEN_ORIGIN = WORKERS_DEV_ORIGINS[GREEN]
  const rankingJson = (body) =>
    response(200, { 'content-type': 'application/json' }, JSON.stringify(body))
  const goodRanking = () =>
    rankingJson({
      items: [
        { id: 'sm45000001', title: 'a' },
        { id: 'so45000002', title: 'b' },
      ],
      metadata: {
        version: 1,
        updatedAt: '2026-10-03T14:24:05.859Z',
        genre: 'all',
        period: '24h',
      },
    })
  const adminDenial = () =>
    response(401, {
      'www-authenticate': 'Basic realm="Admin Area"',
      'cache-control': 'no-store, must-revalidate',
    })
  const run = (workerName, fetchImpl) => {
    const log = vi.fn()
    return {
      log,
      result: checkDeployedWorker(workerName, {
        fetchImpl,
        sleep: noSleep,
        log,
      }),
    }
  }

  it('Green の workers.dev でランキング API と管理パスの拒否を確かめて合格する', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(goodRanking())
      .mockResolvedValueOnce(adminDenial())
    const { log, result } = run(GREEN, fetchImpl)

    await expect(result).resolves.toBe('verified')
    expect(GREEN_ORIGIN).toBe(
      'https://nico-ranking-api-gateway-green.yjsn180180.workers.dev',
    )
    expect(
      fetchImpl.mock.calls.map(([url, init]) => [String(url), init.method]),
    ).toEqual([
      [`${GREEN_ORIGIN}/api/ranking?genre=all&period=24h`, undefined],
      [`${GREEN_ORIGIN}/api/admin/ng-list`, 'HEAD'],
    ])
    expect(fetchImpl.mock.calls[1][1].redirect).toBe('manual')
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toBe(
      'nico-ranking-verification/1.0',
    )
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      `Verified ${GREEN} /api/ranking?genre=all&period=24h on workers.dev: 2 items, updated at 2026-10-03T14:24:05.859Z`,
      `Verified ${GREEN} /api/admin/ng-list on workers.dev: 401 with authentication challenge and no-store`,
    ])
  })

  it('ランキング API の 404 は本文付きで失敗にする（Blue も同じ判定）', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          404,
          { 'content-type': 'application/json' },
          '{"error":"Data not found"}',
        ),
      )
    const { result } = run('nico-ranking-blue-20250706', fetchImpl)

    await expect(result).rejects.toThrow(
      'nico-ranking-blue-20250706 /api/ranking?genre=all&period=24h: HTTP 404\n  content-type: application/json\n  body: {"error":"Data not found"}',
    )
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://nico-ranking-blue-20250706.yjsn180180.workers.dev/api/ranking?genre=all&period=24h',
    )
  })

  it('200 でも JSON でない・items が空なら失敗にする', async () => {
    const notJson = run(
      GREEN,
      vi.fn().mockResolvedValueOnce(response(200, {}, '<html>oops</html>')),
    )
    await expect(notJson.result).rejects.toThrow(
      `${GREEN} /api/ranking?genre=all&period=24h: body is not JSON`,
    )

    const empty = run(
      GREEN,
      vi.fn().mockResolvedValueOnce(
        rankingJson({
          items: [],
          metadata: { genre: 'all', period: '24h', updatedAt: '2026-10-03' },
        }),
      ),
    )
    await expect(empty.result).rejects.toThrow(
      `${GREEN} /api/ranking?genre=all&period=24h: items is empty`,
    )
  })

  it('管理パスが拒否されなければ失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(goodRanking())
      .mockResolvedValueOnce(
        response(200, { 'content-type': 'application/json' }),
      )
    const { result } = run(GREEN, fetchImpl)

    await expect(result).rejects.toThrow(
      `${GREEN} /api/admin/ng-list: expected HTTP 401`,
    )
  })

  it('workers.dev ではチャレンジも緩めずに失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(403, { 'cf-mitigated': 'challenge' }, 'Just a moment...'),
      )
    const { result } = run(GREEN, fetchImpl)

    await expect(result).rejects.toThrow(
      `${GREEN} /api/ranking?genre=all&period=24h: HTTP 403`,
    )
  })

  it('5xx は再試行せずに失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(503, {}, 'error code: 1102'))
      .mockResolvedValueOnce(goodRanking())
    const { result } = run(GREEN, fetchImpl)

    await expect(result).rejects.toThrow('HTTP 503')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('ルーターは workers.dev が無いので、送信せずに理由を出して飛ばす', async () => {
    const fetchImpl = vi.fn()
    const { log, result } = run('nico-ranking-api-gateway', fetchImpl)

    await expect(result).resolves.toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipped the direct check of nico-ranking-api-gateway: it has the nico-rank.com/* route, so its workers.dev URL is disabled',
      ),
    )
  })

  it('知らない Worker 名・名前なしは失敗にせず、警告を出して飛ばす', async () => {
    const unknown = run('lqng-poller', vi.fn())
    await expect(unknown.result).resolves.toBe('skipped')
    expect(unknown.log).toHaveBeenCalledWith(
      `::warning::Skipped the direct check of the deployed Worker: no workers.dev URL is known for "lqng-poller". Known: ${GREEN}, nico-ranking-blue-20250706`,
    )

    const fetchImpl = vi.fn()
    const missing = run(undefined, fetchImpl)
    await expect(missing.result).resolves.toBe('skipped')
    expect(missing.log).toHaveBeenCalledWith(
      expect.stringContaining('no worker name was given (--worker)'),
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('スモークチェック全体の順序', () => {
  const GREEN = 'nico-ranking-api-gateway-green'
  const goodRanking = () =>
    response(
      200,
      {},
      JSON.stringify({
        items: [{ id: 'sm45000001' }],
        metadata: { genre: 'all', period: '24h', updatedAt: '2026-10-03' },
      }),
    )
  const adminDenial = () =>
    response(401, {
      'www-authenticate': 'Basic realm="Admin Area"',
      'cache-control': 'no-store',
    })
  const challenge = () => response(403, { 'cf-mitigated': 'challenge' })

  it('配備した Worker を直接確かめてから公開ドメインを確かめ、要約を出す', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(goodRanking())
      .mockResolvedValueOnce(adminDenial())
      .mockImplementation(async () => challenge())
    const log = vi.fn()

    await expect(
      runSmokeCheck({ workerName: GREEN, fetchImpl, sleep: noSleep, log }),
    ).resolves.toBeUndefined()
    expect(fetchImpl.mock.calls.map(([url]) => new URL(url).host)).toEqual([
      'nico-ranking-api-gateway-green.yjsn180180.workers.dev',
      'nico-ranking-api-gateway-green.yjsn180180.workers.dev',
      'nico-rank.com',
      'nico-rank.com',
      'nico-rank.com',
    ])
    expect(log.mock.calls.at(-1)[0]).toBe(
      `Summary: direct check of ${GREEN} verified; public edge verified 0 of 3, challenged 3`,
    )
  })

  it('直接確認で失敗したら公開ドメインへは送らない', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(500, {}, 'boom'))

    await expect(
      runSmokeCheck({
        workerName: GREEN,
        fetchImpl,
        sleep: noSleep,
        log: vi.fn(),
      }),
    ).rejects.toThrow('HTTP 500')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('directOnly では公開ドメインへ送らない。直接確かめる先が無ければ失敗にする', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(goodRanking())
      .mockResolvedValueOnce(adminDenial())
    await expect(
      runSmokeCheck({
        workerName: GREEN,
        directOnly: true,
        fetchImpl,
        sleep: noSleep,
        log: vi.fn(),
      }),
    ).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    await expect(
      runSmokeCheck({
        workerName: 'nico-ranking-api-gateway',
        directOnly: true,
        fetchImpl: vi.fn(),
        sleep: noSleep,
        log: vi.fn(),
      }),
    ).rejects.toThrow('Nothing was checked')
  })

  it('何も確かめられなかった成功（ルーターのみ・全件チャレンジ）は、未確認の警告と手動確認の手順を残す', async () => {
    const log = vi.fn()
    const writeStepSummary = vi.fn()

    await expect(
      runSmokeCheck({
        workerName: 'nico-ranking-api-gateway',
        fetchImpl: vi.fn(async () => challenge()),
        sleep: noSleep,
        log,
        writeStepSummary,
      }),
    ).resolves.toBeUndefined()
    expect(log.mock.calls.at(-1)[0]).toMatch(
      /^::warning::Deployment NOT verified/,
    )
    expect(writeStepSummary).toHaveBeenCalledTimes(1)
    expect(writeStepSummary.mock.calls[0][0]).toContain(
      '## Deployment NOT verified',
    )
  })

  it('公開ドメインを 1 件でも確かめられたら、未確認の警告は出さない', async () => {
    const writeStepSummary = vi.fn()
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {}, '<a href="https://www.nicovideo.jp/watch/sm1">v</a>'),
      )
      .mockImplementation(async () => challenge())
    const log = vi.fn()

    await runSmokeCheck({
      workerName: 'nico-ranking-api-gateway',
      fetchImpl,
      sleep: noSleep,
      log,
      writeStepSummary,
    })
    expect(writeStepSummary).not.toHaveBeenCalled()
    expect(
      log.mock.calls.some(([line]) => line.includes('Deployment NOT verified')),
    ).toBe(false)
  })

  it('応答の updatedAt はそのままログに出さず、ISO 形式に直して出す（ワークフローコマンドを作らせない）', async () => {
    const injected = response(
      200,
      {},
      JSON.stringify({
        items: [{ id: 'sm45000001' }],
        metadata: {
          genre: 'all',
          period: '24h',
          updatedAt: 'Sat Oct 03 2026 00:00:00 GMT+0000 (\n::error::injected)',
        },
      }),
    )
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(injected)
      .mockResolvedValueOnce(adminDenial())
    const log = vi.fn()

    await runSmokeCheck({
      workerName: GREEN,
      directOnly: true,
      fetchImpl,
      sleep: noSleep,
      log,
    })
    const lines = log.mock.calls.map(([line]) => line).join('\n')
    expect(lines).toContain('updated at 2026-10-03T00:00:00.000Z')
    expect(lines).not.toContain('::error::')
  })
})

describe('GitHub Actions の注釈', () => {
  it('% と改行をエスケープして 1 行にする', () => {
    const line = githubWarning('a%b\r\n::error::c')
    expect(line).toBe('::warning::a%25b%0D%0A::error::c')
    expect(line).not.toMatch(/[\r\n]/)
  })
})
