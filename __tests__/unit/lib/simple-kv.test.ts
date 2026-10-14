// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const PRIVATE_KEY_NAME = 'private-user-key-name'

async function loadKv() {
  vi.resetModules()
  const { kv } = await import('@/lib/simple-kv')
  return kv
}

function timeoutError(): DOMException {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError')
}

function warningLines(warn: { mock: { calls: unknown[][] } }): string[] {
  return warn.mock.calls.map((args) => args.map(String).join(' '))
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

beforeEach(() => {
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account')
  vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'test-namespace')
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token-placeholder')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('simple-kv request bounds', () => {
  it('bounds every get attempt and logs redacted retries before returning null', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const signals: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      signals.push(init?.signal)
      throw timeoutError()
    }))
    const kv = await loadKv()

    const pending = kv.get(PRIVATE_KEY_NAME)
    await vi.advanceTimersByTimeAsync(10_000)

    await expect(pending).resolves.toBeNull()
    expect(signals).toHaveLength(3)
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal)
    const lines = warningLines(warn)
    expect(lines).toEqual([
      expect.stringContaining('get attempt 1/3 failed: timeout'),
      expect.stringContaining('get attempt 2/3 failed: timeout'),
      expect.stringContaining('get attempt 3/3 failed: timeout'),
    ])
    expect(lines.join('\n')).not.toContain(PRIVATE_KEY_NAME)
  })

  it('aborts a stalled response body instead of waiting for it, then retries', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.writeHead(200, { 'Content-Type': 'application/json' })
      if (requests === 1) {
        response.write('{"partial":')
        return
      }
      response.end(JSON.stringify({ ok: true }))
    })
    const url = await listen(server)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const realTimeout = AbortSignal.timeout.bind(AbortSignal)
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(100))
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', (_input: string, init?: RequestInit) => realFetch(url, init))
    try {
      const kv = await loadKv()
      await expect(kv.get(PRIVATE_KEY_NAME)).resolves.toEqual({ ok: true })
      expect(timeout).toHaveBeenCalledWith(20_000)
      expect(requests).toBe(2)
      expect(warningLines(warn)).toEqual([
        expect.stringContaining('get attempt 1/3 failed: timeout'),
      ])
    } finally {
      await close(server)
    }
  }, 5_000)

  it('keeps set failure semantics while logging each redacted attempt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('unavailable', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const kv = await loadKv()

    await expect(kv.set(PRIVATE_KEY_NAME, { value: 1 })).rejects.toThrow('KV set failed: 500')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal)
    const lines = warningLines(warn)
    expect(lines).toEqual([
      expect.stringContaining('set attempt 1/3 failed: http_500'),
      expect.stringContaining('set attempt 2/3 failed: http_500'),
      expect.stringContaining('set attempt 3/3 failed: http_500'),
    ])
    expect(lines.join('\n')).not.toContain(PRIVATE_KEY_NAME)
  })

  it('bounds delete and rethrows its timeout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      throw timeoutError()
    })
    vi.stubGlobal('fetch', fetchMock)
    const kv = await loadKv()

    await expect(kv.del(PRIVATE_KEY_NAME)).rejects.toMatchObject({ name: 'TimeoutError' })

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
    const lines = warningLines(warn)
    expect(lines).toEqual([expect.stringContaining('delete attempt 1/1 failed: timeout')])
    expect(lines.join('\n')).not.toContain(PRIVATE_KEY_NAME)
  })

  it('keeps get results unchanged for found and missing keys', async () => {
    const fetchMock = vi.fn(async (url: string) => (
      url.endsWith('/missing')
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify({ found: true }), { status: 200 })
    ))
    vi.stubGlobal('fetch', fetchMock)
    const kv = await loadKv()

    await expect(kv.get('present')).resolves.toEqual({ found: true })
    await expect(kv.get('missing')).resolves.toBeNull()
  })
})

// 未設定（404）と読み取り失敗の区別・書き込みの失敗を確かめる
describe('simple-kv getStrict and set failures', () => {
  const fetchMock = vi.fn()
  const respond = (status: number, body = ''): Response => new Response(body, { status })

  // 再試行の待ち時間（setTimeout）を進めながら結果を待つ
  async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
    const settled = promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    )
    await vi.runAllTimersAsync()
    return settled
  }

  async function loadModule(): Promise<typeof import('@/lib/simple-kv')> {
    vi.resetModules()
    return import('@/lib/simple-kv')
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('getStrict: 200 は値（JSON なら復元、そうでなければ文字列）を返す', async () => {
    const { kv } = await loadModule()
    fetchMock.mockResolvedValueOnce(respond(200, '{"a":1}')).mockResolvedValueOnce(respond(200, 'plain'))
    expect(await kv.getStrict('k1')).toEqual({ a: 1 })
    expect(await kv.getStrict('k2')).toBe('plain')
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit | undefined)?.signal).toBeInstanceOf(AbortSignal)
  })

  it('getStrict: 404（未設定）は null を返す', async () => {
    const { kv } = await loadModule()
    fetchMock.mockResolvedValueOnce(respond(404))
    expect(await kv.getStrict('missing')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('getStrict: 429 が続いたら再試行ののち KvReadError を投げる（null にしない）', async () => {
    const { kv, KvReadError } = await loadModule()
    fetchMock.mockImplementation(async () => respond(429))
    const { error } = await settle(kv.getStrict('k'))
    expect(error).toBeInstanceOf(KvReadError)
    expect(error).toMatchObject({ status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('getStrict: 5xx・通信エラーが続いたら KvReadError を投げる', async () => {
    const { kv, KvReadError } = await loadModule()
    fetchMock.mockImplementation(async () => respond(503))
    expect((await settle(kv.getStrict('k'))).error).toBeInstanceOf(KvReadError)

    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => {
      throw new TypeError('network down')
    })
    expect((await settle(kv.getStrict('k'))).error).toBeInstanceOf(KvReadError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('getStrict: 一時的な失敗は再試行で回復する', async () => {
    const { kv } = await loadModule()
    fetchMock.mockResolvedValueOnce(respond(429)).mockResolvedValueOnce(respond(500)).mockResolvedValueOnce(respond(200, '[1]'))
    expect((await settle(kv.getStrict('k'))).value).toEqual([1])
  })

  it('getStrict: 再試行しても直らない 4xx（認証エラーなど）は待たずに投げる', async () => {
    const { kv } = await loadModule()
    fetchMock.mockResolvedValue(respond(403))
    const { error } = await settle(kv.getStrict('k'))
    expect(error).toMatchObject({ status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('getStrict: attempts で試行回数を絞れる', async () => {
    const { kv, KvReadError } = await loadModule()
    fetchMock.mockResolvedValue(respond(500))
    expect((await settle(kv.getStrict('k', { attempts: 1 }))).error).toBeInstanceOf(KvReadError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('getStrict: 認証情報が無ければ投げる', async () => {
    const { kv } = await loadModule()
    vi.stubEnv('CLOUDFLARE_API_TOKEN', '')
    await expect(kv.getStrict('k')).rejects.toThrow('Cloudflare KV credentials not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('get: 失敗が続いても従来どおり null を返す', async () => {
    const { kv } = await loadModule()
    fetchMock.mockImplementation(async () => respond(500))
    expect((await settle(kv.get('k'))).value).toBeNull()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => respond(429))
    expect((await settle(kv.get('k'))).value).toBeNull()
  })

  it('set: 429 が続いて再試行が尽きたら例外を出す（黙って成功扱いにしない）', async () => {
    const { kv } = await loadModule()
    fetchMock.mockImplementation(async () => respond(429))
    const { error } = await settle(kv.set('k', { a: 1 }))
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('KV set failed: 429')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('set: 429 のあと成功すれば解決する', async () => {
    const { kv } = await loadModule()
    fetchMock.mockResolvedValueOnce(respond(429)).mockResolvedValueOnce(respond(200))
    const { value, error } = await settle(kv.set('k', 'v'))
    expect(error).toBeUndefined()
    expect(value).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
