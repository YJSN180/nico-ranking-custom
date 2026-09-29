// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithTransientRetry } from '@/lib/fetch-with-transient-retry'

// ランキングの上流（/api/ranking → ゲートウェイ → R2）の一時障害だけを 1 回だけ再試行する
const fetchMock = vi.fn()
const URL_UNDER_TEST = 'https://example.test/api/ranking?genre=game&period=24h'

const status = (code: number) => new Response(JSON.stringify({ status: code }), { status: code })

describe('fetchWithTransientRetry', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([500, 502, 503, 504])('%i のあとは 1 回だけ再試行し、その応答を返す', async (code) => {
    fetchMock.mockResolvedValueOnce(status(code)).mockResolvedValueOnce(status(200))

    const response = await fetchWithTransientRetry(URL_UNDER_TEST, {}, { retryDelayMs: 0 })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('再試行も 5xx ならそれを返す（2 回で打ち切る）', async () => {
    fetchMock.mockImplementation(async () => status(500))

    const response = await fetchWithTransientRetry(URL_UNDER_TEST, {}, { retryDelayMs: 0 })

    expect(response.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('通信エラー（TypeError）のあとも 1 回だけ再試行する', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(status(200))

    const response = await fetchWithTransientRetry(URL_UNDER_TEST, {}, { retryDelayMs: 0 })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([200, 304, 400, 404, 429])('%i は再試行しない（429 はレート制限なので重ねない）', async (code) => {
    fetchMock.mockResolvedValue(code === 304 ? new Response(null, { status: 304 }) : status(code))

    const response = await fetchWithTransientRetry(URL_UNDER_TEST, {}, { retryDelayMs: 0 })

    expect(response.status).toBe(code)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('期限切れ（呼び出し側の signal の中断）は再試行せずにそのまま投げる', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('deadline', 'TimeoutError'))
    fetchMock.mockRejectedValue(new DOMException('deadline', 'TimeoutError'))

    await expect(
      fetchWithTransientRetry(URL_UNDER_TEST, { signal: controller.signal }, { retryDelayMs: 0 })
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('待っている間に期限が切れたら、再試行せずに中断として投げる', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementationOnce(async () => {
      setTimeout(() => controller.abort(new DOMException('deadline', 'TimeoutError')), 5)
      return status(503)
    })

    await expect(
      fetchWithTransientRetry(URL_UNDER_TEST, { signal: controller.signal }, { retryDelayMs: 1_000 })
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('呼び出し側の RequestInit（ヘッダーと signal）をそのまま渡す', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValue(status(200))
    const init = { headers: { Accept: 'application/json' }, cache: 'no-store' as const, signal: controller.signal }

    await fetchWithTransientRetry(URL_UNDER_TEST, init)

    expect(fetchMock).toHaveBeenCalledWith(URL_UNDER_TEST, init)
  })
})
