import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { kv, KvReadError } from '@/lib/simple-kv'

// Cloudflare KV REST API の応答を合成して、未設定（404）と読み取り失敗の区別・書き込みの失敗を確かめる
const fetchMock = vi.fn()

const respond = (status: number, body = ''): Response => new Response(status === 204 ? null : body, { status })

// 再試行の待ち時間（setTimeout）を進めながら結果を待つ
async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const settled = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  )
  await vi.runAllTimersAsync()
  return settled
}

describe('simple-kv', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc')
    vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'ns')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'token')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('getStrict', () => {
    it('200 は値（JSON なら復元、そうでなければ文字列）を返す', async () => {
      fetchMock.mockResolvedValueOnce(respond(200, '{"a":1}')).mockResolvedValueOnce(respond(200, 'plain'))
      expect(await kv.getStrict('k1')).toEqual({ a: 1 })
      expect(await kv.getStrict('k2')).toBe('plain')
    })

    it('404（未設定）は null を返す', async () => {
      fetchMock.mockResolvedValueOnce(respond(404))
      expect(await kv.getStrict('missing')).toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('429 が続いたら再試行ののち KvReadError を投げる（null にしない）', async () => {
      fetchMock.mockImplementation(async () => respond(429))
      const { error } = await settle(kv.getStrict('k'))
      expect(error).toBeInstanceOf(KvReadError)
      expect((error as KvReadError).status).toBe(429)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('5xx・通信エラーが続いたら KvReadError を投げる', async () => {
      fetchMock.mockImplementation(async () => respond(503))
      expect((await settle(kv.getStrict('k'))).error).toBeInstanceOf(KvReadError)

      fetchMock.mockReset()
      fetchMock.mockImplementation(async () => {
        throw new TypeError('network down')
      })
      expect((await settle(kv.getStrict('k'))).error).toBeInstanceOf(KvReadError)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('一時的な失敗は再試行で回復する', async () => {
      fetchMock.mockResolvedValueOnce(respond(429)).mockResolvedValueOnce(respond(500)).mockResolvedValueOnce(respond(200, '[1]'))
      expect((await settle(kv.getStrict('k'))).value).toEqual([1])
    })

    it('再試行しても直らない 4xx（認証エラーなど）は待たずに投げる', async () => {
      fetchMock.mockResolvedValue(respond(403))
      const { error } = await settle(kv.getStrict('k'))
      expect((error as KvReadError).status).toBe(403)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('attempts で試行回数を絞れる', async () => {
      fetchMock.mockResolvedValue(respond(500))
      expect((await settle(kv.getStrict('k', { attempts: 1 }))).error).toBeInstanceOf(KvReadError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('認証情報が無ければ投げる', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', '')
      await expect(kv.getStrict('k')).rejects.toThrow('Cloudflare KV credentials not configured')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('期限（signal）を fetch に渡し、期限が切れたら再試行せずに KvReadError を投げる', async () => {
      const deadline = new AbortController()
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        // 1 回目の失敗の直後に期限が切れる
        deadline.abort()
        return respond(503)
      })
      const { error } = await settle(kv.getStrict('k', { signal: deadline.signal }))
      expect(error).toBeInstanceOf(KvReadError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('1 回の読み取りが応答しなければ timeoutMs で打ち切る', async () => {
      vi.useRealTimers()
      fetchMock.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
          })
      )
      await expect(kv.getStrict('k', { attempts: 1, timeoutMs: 20 })).rejects.toBeInstanceOf(KvReadError)
    })
  })

  describe('get（従来どおり）', () => {
    it('失敗が続いても null を返す', async () => {
      fetchMock.mockImplementation(async () => respond(500))
      expect((await settle(kv.get('k'))).value).toBeNull()
      fetchMock.mockReset()
      fetchMock.mockImplementation(async () => respond(429))
      expect((await settle(kv.get('k'))).value).toBeNull()
    })

    it('404 は null、200 は値', async () => {
      fetchMock.mockResolvedValueOnce(respond(404)).mockResolvedValueOnce(respond(200, '{"b":2}'))
      expect(await kv.get('k')).toBeNull()
      expect(await kv.get('k')).toEqual({ b: 2 })
    })
  })

  describe('set', () => {
    it('成功すれば解決する', async () => {
      fetchMock.mockResolvedValueOnce(respond(200, '{"success":true}'))
      await expect(kv.set('k', { a: 1 })).resolves.toBeUndefined()
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/values/k')
      expect(init.method).toBe('PUT')
      expect(init.body).toBe('{"a":1}')
    })

    it('429 が続いて再試行が尽きたら例外を出す（黙って成功扱いにしない）', async () => {
      fetchMock.mockImplementation(async () => respond(429))
      const { error } = await settle(kv.set('k', { a: 1 }))
      expect(error).toBeInstanceOf(Error)
      expect(String(error)).toContain('429')
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('429 のあと成功すれば解決する', async () => {
      fetchMock.mockResolvedValueOnce(respond(429)).mockResolvedValueOnce(respond(200))
      const { value, error } = await settle(kv.set('k', 'v'))
      expect(error).toBeUndefined()
      expect(value).toBeUndefined()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('5xx が続いたら例外を出す', async () => {
      fetchMock.mockImplementation(async () => respond(500))
      expect((await settle(kv.set('k', 'v'))).error).toBeInstanceOf(Error)
    })
  })
})
