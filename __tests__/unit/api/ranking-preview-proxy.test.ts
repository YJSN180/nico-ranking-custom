// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/ranking（Edge）のプレビュー・ローカル用プロキシ。Edge Function は最初の応答を 25 秒以内に
// 返す必要があるので、上流の待ち（本文を含む）はそれより前に打ち切る。失敗時の本文とログに
// エラーの詳細・URL・クエリの値を出さない

vi.mock('@/lib/sentry/capture', () => ({
  captureWebException: vi.fn(),
}))

import { GET } from '@/app/api/ranking/route'
import { captureWebException } from '@/lib/sentry/capture'

const PREVIEW_HOST = 'localhost:3107'
const previewRequest = () =>
  new NextRequest(`http://${PREVIEW_HOST}/api/ranking?genre=game&period=24h&tag=%E5%90%88%E6%88%90%E3%82%BF%E3%82%B0`, {
    headers: { host: PREVIEW_HOST },
  })

const fetchMock = vi.fn()
const NOT_YET = Symbol('pending')

/** まだ応答していなければ NOT_YET（待っているマイクロタスクは先に流す） */
function peek(pending: Promise<Response>): Promise<Response | typeof NOT_YET> {
  return Promise.race([pending, new Promise<typeof NOT_YET>((resolve) => setImmediate(() => resolve(NOT_YET)))])
}

const abortError = () => new DOMException('This operation was aborted', 'AbortError')

describe('/api/ranking のプレビュー用プロキシ', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.mocked(captureWebException).mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('上流の応答はそのまま中継する', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [], popularTags: ['合成タグ'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"synthetic-etag"' },
      })
    )

    const response = await GET(previewRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe('"synthetic-etag"')
    expect(await response.json()).toEqual({ items: [], popularTags: ['合成タグ'] })
    const [target] = fetchMock.mock.calls[0] ?? []
    expect(new URL(String(target)).searchParams.get('tag')).toBe('合成タグ')
  })

  it('500 の本文にエラーの詳細を入れず、ログにも URL・クエリの値・ホストを出さない', async () => {
    const secretLike = 'synthetic-secret-value'
    fetchMock.mockRejectedValue(
      new TypeError(`fetch failed: https://nico-rank.com/api/ranking?tag=合成タグ&key=${secretLike}`)
    )

    const response = await GET(previewRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch ranking data', type: 'proxy_error' })

    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((value) => (value instanceof Error ? `${value.name}: ${value.message}` : String(value)))
      .join('\n')
    // 失敗したことと種類はログに残す
    expect(logged).toContain('TypeError')
    expect(logged).not.toMatch(/https?:\/\//)
    expect(logged).not.toContain(secretLike)
    expect(logged).not.toContain('合成タグ')
    expect(logged).not.toContain(PREVIEW_HOST)
    expect(captureWebException).toHaveBeenCalledTimes(1)
  })

  it('上流が応答しなければ 20 秒で打ち切って 500 を返す（Edge の上限 25 秒より前）', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fetchMock.mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(abortError()))
        })
    )

    const pending = GET(previewRequest())

    await vi.advanceTimersByTimeAsync(19_999)
    expect(await peek(pending)).toBe(NOT_YET)

    await vi.advanceTimersByTimeAsync(1)
    const response = await peek(pending)
    expect(response).not.toBe(NOT_YET)
    expect((response as Response).status).toBe(500)
    expect(await (response as Response).json()).toEqual({ error: 'Failed to fetch ranking data', type: 'proxy_error' })
  })

  it('ヘッダーのあと本文が止まっても、同じ 20 秒で打ち切る', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"items":['))
          // 実際の fetch と同じく、中断されたら本文の読み取りを失敗させる
          init?.signal?.addEventListener('abort', () => controller.error(abortError()))
        },
      })
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const pending = GET(previewRequest())

    await vi.advanceTimersByTimeAsync(20_000)
    const response = await peek(pending)
    expect(response).not.toBe(NOT_YET)
    expect((response as Response).status).toBe(500)
  })
})
