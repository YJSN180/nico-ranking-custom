// @vitest-environment node
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
  captureWorkerMessage: vi.fn(),
  sanitizeUrlForSentry: vi.fn(),
}))

import worker from '../../workers/api-gateway-green-20250726'
import { captureWorkerException, captureWorkerMessage } from '../../workers/sentry.js'
import { encodeTagPopularity } from '../../workers/utils/tag-suggest'

const fetchWorker = worker.fetch as unknown as (
  request: Request,
  env: Record<string, unknown>,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
) => Promise<Response>

const ctx = { waitUntil: vi.fn() }

function greenEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    R2_BUCKET: { get: vi.fn(async () => null) },
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    VERCEL_DEPLOYMENT_URL: 'https://upstream.example',
    WORKER_AUTH_KEY: 'test-only-worker-key',
    ...overrides,
  }
}

function stubUpstream(...responses: Response[]) {
  const upstream = vi.fn(async (input: Request | string, _init?: RequestInit) => {
    void input
    return responses.shift() ?? new Response('unexpected', { status: 599 })
  })
  vi.stubGlobal('fetch', upstream)
  return upstream
}

function requestedUrl(call: [Request | string, RequestInit?]): string {
  const [input] = call
  return typeof input === 'string' ? input : input.url
}

function requestedHeaders(call: [Request | string, RequestInit?]): Headers {
  const [input, init] = call
  return typeof input === 'string' ? new Headers(init?.headers) : input.headers
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const RANKING_KEY = 'rankings/all/24h/all.json'
const r2InternalError = () => new Error('get: We encountered an internal error. Please try again. (10001)')

function rankingObject() {
  const body = JSON.stringify({
    items: [{ id: 'sm1', title: 'Synthetic &amp; title' }],
    popularTags: [],
    metadata: { updatedAt: '2026-01-01T00:00:00.000Z' },
  })
  return { etag: 'synthetic', httpMetadata: {}, body: new Response(body).body }
}

/** R2 get that fails `failures` times for `failingKey`, then serves the legacy ranking object. */
function flakyBucket(failingKey: string, failures: number, error: () => Error = r2InternalError) {
  let remaining = failures
  return {
    get: vi.fn(async (key: string) => {
      if (key === failingKey && remaining > 0) {
        remaining--
        throw error()
      }
      return key === RANKING_KEY ? rankingObject() : null
    }),
  }
}

function getCalls(bucket: { get: ReturnType<typeof vi.fn> }, key: string): number {
  return bucket.get.mock.calls.filter(([requested]) => requested === key).length
}

describe('green R2 reads', () => {
  it.each([
    ['the ranking object', RANKING_KEY],
    ['the generation pointer', 'rankings/current.json'],
  ])('retries a transient R2 internal error while reading %s', async (_label, key) => {
    const bucket = flakyBucket(key, 1)

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/ranking?genre=all&period=24h'),
      greenEnv({ R2_BUCKET: bucket }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect((await response.json()).items[0].title).toBe('Synthetic & title')
    expect(getCalls(bucket, key)).toBe(2)
  })

  it('retries a 503 (10043) as well', async () => {
    const bucket = flakyBucket(RANKING_KEY, 1, () => new Error('get: Service unavailable. (10043)'))

    const response = await fetchWorker(new Request('https://nico-rank.com/api/ranking'), greenEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(200)
    expect(getCalls(bucket, RANKING_KEY)).toBe(2)
  })

  it('gives up after two retries', async () => {
    const bucket = flakyBucket(RANKING_KEY, 5)

    const response = await fetchWorker(new Request('https://nico-rank.com/api/ranking'), greenEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(500)
    expect(getCalls(bucket, RANKING_KEY)).toBe(3)
  })

  it('does not retry errors that are not transient', async () => {
    const bucket = flakyBucket(RANKING_KEY, 5, () => new Error('get: Access denied. (10003)'))

    const response = await fetchWorker(new Request('https://nico-rank.com/api/ranking'), greenEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(500)
    expect(getCalls(bucket, RANKING_KEY)).toBe(1)
  })
})

describe('green upstream proxy', () => {
  it('does not send the worker secret to the upstream deployment', async () => {
    const upstream = stubUpstream(Response.json({ popularTags: [] }))

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/popular-tags?genre=all', {
        headers: { 'X-Worker-Auth': 'client-supplied-guess' },
      }),
      greenEnv(),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(requestedUrl(upstream.mock.calls[0])).toBe('https://upstream.example/api/popular-tags?genre=all')
    expect(requestedHeaders(upstream.mock.calls[0]).get('X-Worker-Auth')).toBeNull()
  })
})

describe('green HD thumbnail', () => {
  const page = (ogImage: string) =>
    new Response(`<html><head><meta property="og:image" content="${ogImage}"></head></html>`, {
      headers: { 'Content-Type': 'text/html' },
    })
  const JP_OG_IMAGE = 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/1/1.1.original/r1280x720l?key=synthetic'

  async function hdThumbnail(videoId: string) {
    const response = await fetchWorker(new Request(`https://nico-rank.com/api/hd-thumbnail/${videoId}`), greenEnv(), ctx)
    return { response, body: (await response.json()) as { thumbnail: string | null; source: string } }
  }

  it.each([
    'javascript:alert(document.domain)',
    'http://nicovideo.cdn.nimg.jp/thumbnails/1/1.1',
    'https://elsewhere.example/thumbnails/1/1.1',
    'https://nicovideo.cdn.nimg.jp.elsewhere.example/thumbnails/1/1.1',
  ])('does not return the mirror og:image %s and reads nicovideo.jp instead', async (ogImage) => {
    const upstream = stubUpstream(page(ogImage), page(JP_OG_IMAGE))

    const { response, body } = await hdThumbnail('sm1')

    expect(response.status).toBe(200)
    expect(body.thumbnail).toBe(JP_OG_IMAGE)
    expect(body.source).toBe('nicovideo.jp og:image')
    expect(requestedUrl(upstream.mock.calls[0])).toBe('https://www.nicovideo.gay/watch/sm1')
    expect(requestedUrl(upstream.mock.calls[1])).toBe('https://www.nicovideo.jp/watch/sm1')
  })

  it('uses a mirror og:image on the thumbnail CDN', async () => {
    const upstream = stubUpstream(page('https://nicovideo.cdn.nimg.jp/thumbnails/1/1.12345'))

    const { body } = await hdThumbnail('sm1')

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(body.thumbnail).toBe('https://nicovideo.cdn.nimg.jp/thumbnails/1/1.12345.original')
    expect(body.source).toBe('nicovideo.gay og:image')
  })

  it('bounds each source with a timeout and falls back when the mirror fails', async () => {
    const upstream = vi.fn(async (input: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      if (input.startsWith('https://www.nicovideo.gay/')) throw new DOMException('The operation timed out.', 'TimeoutError')
      return page(JP_OG_IMAGE)
    })
    vi.stubGlobal('fetch', upstream)

    const { body } = await hdThumbnail('sm1')

    expect(upstream).toHaveBeenCalledTimes(2)
    expect(body.thumbnail).toBe(JP_OG_IMAGE)
  })

  it('answers thumbnail null when no source has a thumbnail CDN URL', async () => {
    stubUpstream(page('javascript:alert(1)'), page('https://elsewhere.example/x.jpg'))

    const { response, body } = await hdThumbnail('sm1')

    expect(response.status).toBe(200)
    expect(body.thumbnail).toBeNull()
  })

  it('reads so videos from nicovideo.jp directly, as the site route does', async () => {
    const upstream = stubUpstream(page(JP_OG_IMAGE))

    const { body } = await hdThumbnail('so1')

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(requestedUrl(upstream.mock.calls[0])).toBe('https://www.nicovideo.jp/watch/so1')
    expect(body.thumbnail).toBe(JP_OG_IMAGE)
  })
})


describe('green logging', () => {
  it.each([
    ['a tag without data', null],
    ['a tag with data', rankingObject],
  ])('keeps the requested tag out of console output for %s (console lines become Sentry breadcrumbs)', async (_label, object) => {
    const lines: string[] = []
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
      })
    }
    const tag = 'synthetic private tag'
    const bucket = { get: vi.fn(async (key: string) => (key.includes('/tags/') && object ? object() : null)) }

    const response = await fetchWorker(
      new Request(`https://nico-rank.com/api/ranking?genre=all&period=24h&tag=${encodeURIComponent(tag)}`),
      greenEnv({ R2_BUCKET: bucket }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join('\n')).not.toContain(tag)
    expect(lines.join('\n')).not.toContain(encodeURIComponent(tag))
  })
})

describe('green tag autocomplete', () => {
  const tags = Array.from({ length: 80 }, (_, i) => `syn${String(i).padStart(2, '0')}`)
  const TAG_KEY = 'tag-accumulation.json'
  const TTL_MS = 10 * 60 * 1000
  const WAIT_MS = 2_000
  const MAX_BYTES = 4.5 * 1024 * 1024
  const RETRY_MS = 60 * 1000

  interface TagObjectMock {
    etag: string
    size: number
    httpMetadata: Record<string, never>
    body?: { cancel: ReturnType<typeof vi.fn> }
    arrayBuffer?: ReturnType<typeof vi.fn>
  }

  /** バイト列を、それだけを持つ ArrayBuffer にする */
  function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    return buffer
  }

  let etagCount = 0
  /** 本文のある R2 オブジェクト（R2ObjectBody）を模す。etag は既定で読み取りごとに変わる */
  function tagObject(body: string | Uint8Array, etag = `synthetic-etag-${++etagCount}`): TagObjectMock {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
    return {
      etag,
      size: bytes.byteLength,
      httpMetadata: {},
      body: { cancel: vi.fn(async () => undefined) },
      arrayBuffer: vi.fn(async () => toArrayBuffer(bytes)),
    }
  }

  /** 本文が上限より大きいオブジェクト。本文は読まれない前提 */
  function oversizedObject(): TagObjectMock {
    return {
      etag: 'synthetic-oversized',
      size: MAX_BYTES + 1,
      httpMetadata: {},
      body: { cancel: vi.fn(async () => undefined) },
      arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    }
  }

  /** 本文の読み取りが finish を呼ぶまで終わらないオブジェクト。called は読み取りが始まると解決する */
  function deferredObject(etag = 'synthetic-deferred') {
    let finish: (body: string) => void = () => undefined
    let markCalled: () => void = () => undefined
    const called = new Promise<void>((resolve) => {
      markCalled = resolve
    })
    const object: TagObjectMock = {
      etag,
      size: 1024,
      httpMetadata: {},
      body: { cancel: vi.fn(async () => undefined) },
      arrayBuffer: vi.fn(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            finish = (body) => resolve(toArrayBuffer(new TextEncoder().encode(body)))
            markCalled()
          }),
      ),
    }
    return { object, called, finish: (body: string) => finish(body) }
  }

  function accumulation(list: unknown[], lastUpdated = '2026-01-01T00:00:00.000Z'): string {
    return JSON.stringify({ tags: list, metadata: { lastUpdated, totalUniqueTags: list.length } })
  }

  type BucketAnswer = string | null | Error | TagObjectMock

  /** 1 回目の get から順に、本文（文字列）・null（オブジェクトなし）・Error（読み取り失敗）・用意したオブジェクトを返す */
  function sequenceBucket(...answers: BucketAnswer[]) {
    let last: BucketAnswer = null
    return {
      get: vi.fn(async (key: string, _options?: { onlyIf?: { etagDoesNotMatch?: string } }) => {
        if (key !== TAG_KEY) return null
        const next = answers.length > 0 ? answers.shift() ?? null : last
        last = next
        if (next instanceof Error) throw next
        if (next === null) return null
        return typeof next === 'string' ? tagObject(next) : next
      }),
    }
  }

  /** etag が一致する条件付きの get には、本文のない R2Object（変わっていない）で答える */
  function versionedBucket(body: string, etag: string) {
    const objects: TagObjectMock[] = []
    return {
      objects,
      get: vi.fn(async (key: string, options?: { onlyIf?: { etagDoesNotMatch?: string } }) => {
        if (key !== TAG_KEY) return null
        if (options?.onlyIf?.etagDoesNotMatch === etag) return { etag, size: 1024, httpMetadata: {} }
        const object = tagObject(body, etag)
        objects.push(object)
        return object
      }),
    }
  }

  // 応答の前に、済ませられる処理（マイクロタスク）を済ませる
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

  const tagBucket = () => sequenceBucket(accumulation(tags))

  // waitUntil に載った読み込み（期限切れ後は応答の後で終わる）を集めておき、settle で待つ
  const background: Promise<unknown>[] = []
  const tagCtx = { waitUntil: (promise: Promise<unknown>) => void background.push(promise) }
  const settle = async (): Promise<void> => {
    await Promise.all(background.splice(0))
  }
  afterEach(() => {
    background.length = 0
    vi.useRealTimers()
    vi.mocked(captureWorkerMessage).mockClear()
  })

  function autocomplete(query: string, bucket: { get: ReturnType<typeof vi.fn> }, headers: Record<string, string> = {}) {
    return fetchWorker(
      new Request(`https://nico-rank.com/api/tags/autocomplete?${query}`, { headers }),
      greenEnv({ R2_BUCKET: bucket }),
      tagCtx,
    )
  }

  async function suggestions(query: string, bucket: { get: ReturnType<typeof vi.fn> }): Promise<string[]> {
    const response = await autocomplete(query, bucket)
    expect(response.status).toBe(200)
    return ((await response.json()) as { suggestions: string[] }).suggestions
  }

  const tagReads = (bucket: { get: ReturnType<typeof vi.fn> }) => getCalls(bucket, TAG_KEY)
  // 期限切れ後の読み直しで失敗する R2 エラー（再試行の対象外）
  const deniedError = () => new Error('get: Access denied. (10003)')

  it.each([
    ['10', 10, 10],
    ['-1', 10, 10],
    ['not-a-number', 10, 10],
    ['0', 10, 10],
    ['1000', 50, 50],
    [null, 10, 10],
  ])('keeps limit=%s within 1..50', async (limit, expectedCount, expectedMax) => {
    const query = limit === null ? '' : `&limit=${limit}`
    const response = await fetchWorker(
      new Request(`https://nico-rank.com/api/tags/autocomplete?q=syn${query}`),
      greenEnv({ R2_BUCKET: tagBucket() }),
      ctx,
    )
    const body = (await response.json()) as { suggestions: string[]; metadata: { maxResults: number } }

    expect(response.status).toBe(200)
    expect(body.suggestions).toHaveLength(expectedCount)
    expect(body.metadata.maxResults).toBe(expectedMax)
  })

  it('answers the existing response shape with a 5 minute Cache-Control', async () => {
    const response = await autocomplete('q=syn0&limit=3', tagBucket(), { Origin: 'https://nico-rank.com' })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(response.headers.get('Vary')).toBe('Origin')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://nico-rank.com')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.json()).toEqual({
      query: 'syn0',
      suggestions: ['syn00', 'syn01', 'syn02'],
      metadata: {
        total: 3,
        maxResults: 3,
        source: 'r2-tag-accumulation',
        lastUpdated: '2026-01-01T00:00:00.000Z',
        totalUniqueTags: 80,
      },
    })
  })

  it('lists prefix matches before substring matches, each in dictionary order', async () => {
    const bucket = sequenceBucket(accumulation(['xsyn1', 'syn-b', 'asyn2', 'SYN-A', 'other']))

    expect(await suggestions('q=syn', bucket)).toEqual(['syn-b', 'SYN-A', 'xsyn1', 'asyn2'])
  })

  it('orders by popularity when the dictionary carries a known popularity format', async () => {
    const list = ['syn-a', 'syn-b', 'xsyn', 'syn']
    const popular = (popularityVersion: unknown, scores: unknown): string =>
      JSON.stringify({
        tags: list,
        popularity: { base: -26, scores },
        metadata: { lastUpdated: '2026-10-03T00:00:00.000Z', totalUniqueTags: list.length, popularityVersion },
      })
    const scores = encodeTagPopularity([1, 9, 50, 0])

    // キーが同じタグ、前方一致、部分一致の順に、それぞれ人気の高い順
    expect(await suggestions('q=syn', sequenceBucket(popular(1, scores)))).toEqual(['syn', 'syn-b', 'syn-a', 'xsyn'])
    // 形式が分からない・形が合わない人気度は使わず、辞書の順で答える
    for (const [version, value] of [[2, scores], [undefined, scores], [1, scores.slice(3)], [1, 'not base-36!']]) {
      expect(await suggestions('q=syn', sequenceBucket(popular(version, value)))).toEqual(['syn-a', 'syn-b', 'syn', 'xsyn'])
    }
  })

  it('matches full-width input through NFKC', async () => {
    const bucket = sequenceBucket(accumulation(['ｹﾞｰﾑ実況', 'VOCALOID']))

    expect(await suggestions(`q=${encodeURIComponent('ＶＯＣＡ')}`, bucket)).toEqual(['VOCALOID'])
    expect(await suggestions(`q=${encodeURIComponent('ゲーム')}`, bucket)).toEqual(['ｹﾞｰﾑ実況'])
  })

  it('reads R2 once for repeated and concurrent requests within the TTL', async () => {
    const bucket = tagBucket()

    await Promise.all([suggestions('q=syn1', bucket), suggestions('q=syn2', bucket), suggestions('q=syn3', bucket)])
    expect(await suggestions('q=syn4&limit=2', bucket)).toEqual(['syn40', 'syn41'])

    expect(tagReads(bucket)).toBe(1)
  })

  it('keeps the shared load alive with waitUntil so a disconnected first request does not cancel it', async () => {
    const waitUntil = vi.fn()

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/tags/autocomplete?q=syn'),
      greenEnv({ R2_BUCKET: tagBucket() }),
      { waitUntil },
    )

    expect(response.status).toBe(200)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('starts a new load when the shared one has not finished within 30 seconds', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(4_000_000)
    let calls = 0
    const bucket = {
      get: vi.fn((key: string) => {
        if (key !== TAG_KEY) return Promise.resolve(null)
        calls++
        // 1 回目の読み込みは終わらない（始めた要求が打ち切られた場合を模す）
        return calls === 1 ? new Promise<never>(() => undefined) : Promise.resolve(tagObject(accumulation(['syn-retry'])))
      }),
    }

    // 終わらない読み込みを待つ要求は、ここでは待たない
    void autocomplete('q=syn', bucket)
    await vi.waitFor(() => expect(tagReads(bucket)).toBe(1))
    now.mockReturnValue(4_000_000 + 30_000)
    void autocomplete('q=syn', bucket)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(tagReads(bucket)).toBe(1)

    now.mockReturnValue(4_000_000 + 30_001)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-retry'])
    expect(tagReads(bucket)).toBe(2)
  })

  it('drops a superseded load that finishes late, without reading its body', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(4_500_000)
    const stale = tagObject(accumulation(['syn-stale']))
    let answerFirst: (object: TagObjectMock) => void = () => undefined
    let calls = 0
    const bucket = {
      get: vi.fn((key: string) => {
        if (key !== TAG_KEY) return Promise.resolve(null)
        calls++
        if (calls === 1) {
          return new Promise<TagObjectMock>((resolve) => {
            answerFirst = resolve
          })
        }
        return Promise.resolve(tagObject(accumulation(['syn-retry'])))
      }),
    }

    void autocomplete('q=syn', bucket)
    await vi.waitFor(() => expect(tagReads(bucket)).toBe(1))
    now.mockReturnValue(4_500_000 + 30_001)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-retry'])

    // 打ち切った読み込みが後から終わっても、本文を読まず新しい索引を上書きしない
    answerFirst(stale)
    await settle()
    expect(stale.arrayBuffer).not.toHaveBeenCalled()
    expect(stale.body?.cancel).toHaveBeenCalledTimes(1)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-retry'])
    expect(tagReads(bucket)).toBe(2)
  })

  it.each([
    ['a valid dictionary', JSON.stringify({ tags: ['syn-stale'], metadata: {} })],
    ['a broken dictionary', '{"tags": ['],
  ])('drops a superseded load whose body finishes late with %s, keeping the newer index', async (_label, lateBody) => {
    vi.mocked(captureWorkerException).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const now = vi.spyOn(Date, 'now').mockReturnValue(4_700_000)
    const stalled = deferredObject()
    const bucket = sequenceBucket(accumulation(['syn-old']), stalled.object, accumulation(['syn-retry']))

    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    now.mockReturnValue(4_700_000 + TTL_MS)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    // 読み直しは古い索引を手放し、本文の読み取りで止まる
    await stalled.called

    // 30 秒を過ぎたら新しい読み込みが始まり、その索引で答える
    now.mockReturnValue(4_700_000 + TTL_MS + 30_001)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-retry'])

    // 止まっていた読み込みが後から終わっても、新しい索引を書き換えず、失敗も記録しない
    stalled.finish(lateBody)
    await settle()
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-retry'])
    expect(tagReads(bucket)).toBe(3)
    expect(captureWorkerException).not.toHaveBeenCalled()
  })

  it('does not share the index between R2 bindings', async () => {
    const first = sequenceBucket(accumulation(['syn-first']))
    const second = sequenceBucket(accumulation(['syn-second']))

    expect(await suggestions('q=syn', first)).toEqual(['syn-first'])
    expect(await suggestions('q=syn', second)).toEqual(['syn-second'])
  })

  it('reloads the dictionary after the TTL in the background', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const bucket = sequenceBucket(accumulation(['syn-old']), accumulation(['syn-new']))

    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    now.mockReturnValue(1_000_000 + TTL_MS - 1)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    await settle()
    expect(tagReads(bucket)).toBe(1)

    // 期限切れ後の要求は古い索引ですぐに答え、読み直しは waitUntil の裏で進める
    now.mockReturnValue(1_000_000 + TTL_MS)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    await settle()
    expect(tagReads(bucket)).toBe(2)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-new'])
    expect(tagReads(bucket)).toBe(2)
  })

  it('keeps answering from the previous index while a refresh is stalled, with a single refresh', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000_000)
    let calls = 0
    const bucket = {
      get: vi.fn((key: string) => {
        if (key !== TAG_KEY) return Promise.resolve(null)
        calls++
        // 期限切れ後の読み直し（2 回目）は終わらない
        return calls === 1 ? Promise.resolve(tagObject(accumulation(['syn-old']))) : new Promise<never>(() => undefined)
      }),
    }

    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    now.mockReturnValue(5_000_000 + TTL_MS)
    expect(await Promise.all([suggestions('q=syn', bucket), suggestions('q=syn', bucket)])).toEqual([['syn-old'], ['syn-old']])
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    expect(tagReads(bucket)).toBe(2)
  })

  it.each([
    ['an R2 error', deniedError(), 'r2-read'],
    ['a missing object', null, null],
  ])('keeps serving the previous index when a refresh hits %s', async (_label, failure, upstreamKind) => {
    vi.mocked(captureWorkerException).mockClear()
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    const bucket = sequenceBucket(accumulation(['syn-kept']), failure)

    expect(await suggestions('q=syn-private', bucket)).toEqual([])
    now.mockReturnValue(2_000_000 + TTL_MS)
    const response = await autocomplete('q=syn-private', bucket)
    await settle()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(((await response.json()) as { suggestions: string[] }).suggestions).toEqual([])
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
    expect(tagReads(bucket)).toBe(2)
    if (upstreamKind) {
      expect(captureWorkerException).toHaveBeenCalledTimes(1)
      expect(vi.mocked(captureWorkerException).mock.calls[0][1]).toMatchObject({ tags: { upstream_kind: upstreamKind } })
    } else {
      expect(captureWorkerException).not.toHaveBeenCalled()
    }
    // 利用者のクエリはログに残さない
    expect(lines.join('\n')).not.toContain('syn-private')
  })

  it.each([
    ['unparsable JSON', '{"tags": ['],
    ['data without a tags array', JSON.stringify({ tags: 'syn-broken' })],
  ])('answers parse-error like a first load after a changed dictionary with %s, and reads again only after a minute', async (_label, broken) => {
    vi.mocked(captureWorkerException).mockClear()
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_500_000)
    const bucket = sequenceBucket(accumulation(['syn-old']), broken, accumulation(['syn-fresh']))

    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    now.mockReturnValue(2_500_000 + TTL_MS)
    // 期限切れ後の要求は古い索引で答える。読み直しは古い索引を手放してから本文を読み、解析に失敗する
    expect(await suggestions('q=syn-private', bucket)).toEqual([])
    await settle()

    // 古い索引はもうないので、最初の読み込みと同じく 500 を返す（キャッシュさせない）。1 分の間は R2 を読み直さない
    for (const offset of [0, RETRY_MS - 1]) {
      now.mockReturnValue(2_500_000 + TTL_MS + offset)
      const response = await autocomplete('q=syn-private', bucket)
      expect(response.status).toBe(500)
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('parse-error')
    }
    expect(tagReads(bucket)).toBe(2)
    expect(captureWorkerException).toHaveBeenCalledTimes(1)
    expect(vi.mocked(captureWorkerException).mock.calls[0][1]).toMatchObject({ tags: { upstream_kind: 'r2-parse' } })

    // 1 分後に条件なしで読み直し、新しい辞書を読み込む
    now.mockReturnValue(2_500_000 + TTL_MS + RETRY_MS)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-fresh'])
    expect(tagReads(bucket)).toBe(3)
    expect(bucket.get.mock.calls[2]).toEqual([TAG_KEY])
    expect(lines.join('\n')).not.toContain('syn-private')
  })

  it('ignores lastSeen and other extra fields in compact JSON', async () => {
    const compact = JSON.stringify({
      tags: ['syn-a', 'syn-b', 'other'],
      lastSeen: { day: 20729, ages: '012' },
      metadata: { lastUpdated: '2026-10-03T00:00:00.000Z', totalUniqueTags: 3 },
    })
    const response = await autocomplete('q=syn', sequenceBucket(compact))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      query: 'syn',
      suggestions: ['syn-a', 'syn-b'],
      metadata: { total: 2, maxResults: 10, source: 'r2-tag-accumulation', lastUpdated: '2026-10-03T00:00:00.000Z', totalUniqueTags: 3 },
    })
  })

  describe('dictionary size guard', () => {
    it('does not read an oversized dictionary when there is no index, and answers tag-data-too-large without caching', async () => {
      const warnings: string[] = []
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
      })
      const now = vi.spyOn(Date, 'now').mockReturnValue(7_000_000)
      const oversized = oversizedObject()
      const bucket = sequenceBucket(oversized, accumulation(['syn-small']))

      const response = await autocomplete('q=syn-private', bucket, { Origin: 'https://nico-rank.com' })

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Vary')).toBe('Origin')
      expect(await response.json()).toEqual({
        query: 'syn-private',
        suggestions: [],
        metadata: { total: 0, source: 'tag-data-too-large' },
      })
      expect(oversized.arrayBuffer).not.toHaveBeenCalled()
      expect(oversized.body?.cancel).toHaveBeenCalledTimes(1)
      // 警告は大きさだけを載せ、利用者のクエリを含めない
      expect(captureWorkerMessage).toHaveBeenCalledTimes(1)
      const [message, level, options] = vi.mocked(captureWorkerMessage).mock.calls[0]
      expect(level).toBe('warning')
      expect(options).toMatchObject({
        tags: { endpoint_family: '/api/tags/autocomplete', upstream_kind: 'r2-size' },
        contexts: { tag_dictionary: { size_bytes: MAX_BYTES + 1, max_bytes: MAX_BYTES } },
      })
      expect(JSON.stringify([message, options])).not.toContain('syn-private')
      expect(warnings.join('\n')).not.toContain('syn-private')

      // TTL の間は R2 を読み直さず、警告も重ねない
      now.mockReturnValue(7_000_000 + TTL_MS - 1)
      const again = await autocomplete('q=syn', bucket)
      expect(((await again.json()) as { metadata: { source: string } }).metadata.source).toBe('tag-data-too-large')
      expect(tagReads(bucket)).toBe(1)
      expect(captureWorkerMessage).toHaveBeenCalledTimes(1)

      now.mockReturnValue(7_000_000 + TTL_MS)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-small'])
      expect(tagReads(bucket)).toBe(2)
    })

    it('keeps serving the existing index when a refresh finds an oversized dictionary, and checks again after the TTL', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const now = vi.spyOn(Date, 'now').mockReturnValue(8_000_000)
      const oversized = oversizedObject()
      const bucket = sequenceBucket(accumulation(['syn-kept']), oversized, accumulation(['syn-next']))

      expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
      now.mockReturnValue(8_000_000 + TTL_MS)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
      await settle()

      expect(oversized.arrayBuffer).not.toHaveBeenCalled()
      expect(oversized.body?.cancel).toHaveBeenCalledTimes(1)
      expect(captureWorkerMessage).toHaveBeenCalledTimes(1)
      // 失敗時の 1 分後ではなく、通常の TTL 後に確かめ直す
      now.mockReturnValue(8_000_000 + 2 * TTL_MS - 1)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
      await settle()
      expect(tagReads(bucket)).toBe(2)

      now.mockReturnValue(8_000_000 + 2 * TTL_MS)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
      await settle()
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-next'])
      expect(tagReads(bucket)).toBe(3)
    })

    it('still loads a dictionary of exactly 4.5 MiB', async () => {
      const object = tagObject(accumulation(['syn-limit']))
      object.size = MAX_BYTES

      expect(await suggestions('q=syn', sequenceBucket(object))).toEqual(['syn-limit'])
      expect(captureWorkerMessage).not.toHaveBeenCalled()
    })

    it('compares the stored gzip size, not the expanded JSON, with the limit', async () => {
      // 展開すると上限を超えるが、R2 に置いた gzip のままでは小さい辞書は読む
      const expanded = JSON.stringify({ tags: ['syn-gzip'], padding: 'x'.repeat(MAX_BYTES + 1), metadata: {} })
      const object = tagObject(gzipSync(expanded))
      expect(object.size).toBeLessThan(MAX_BYTES)

      expect(await suggestions('q=syn', sequenceBucket(object))).toEqual(['syn-gzip'])
      expect(captureWorkerMessage).not.toHaveBeenCalled()
    })
  })

  describe('conditional refresh', () => {
    it('asks R2 only for a changed dictionary and does not re-read an unchanged one', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(9_000_000)
      const bucket = versionedBucket(accumulation(['syn-same']), 'synthetic-v1')

      expect(await suggestions('q=syn', bucket)).toEqual(['syn-same'])
      // 最初の読み込みは条件なし
      expect(bucket.get.mock.calls[0]).toEqual([TAG_KEY])

      now.mockReturnValue(9_000_000 + TTL_MS)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-same'])
      await settle()

      expect(bucket.get.mock.calls[1]).toEqual([TAG_KEY, { onlyIf: { etagDoesNotMatch: 'synthetic-v1' } }])
      // 変わっていなければ本文を読まない（読んだ本文は最初の 1 つだけ）
      expect(bucket.objects).toHaveLength(1)
      expect(bucket.objects[0].arrayBuffer).toHaveBeenCalledTimes(1)

      // 次に確かめるのは TTL 後
      now.mockReturnValue(9_000_000 + 2 * TTL_MS - 1)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-same'])
      await settle()
      expect(tagReads(bucket)).toBe(2)
      now.mockReturnValue(9_000_000 + 2 * TTL_MS)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-same'])
      await settle()
      expect(tagReads(bucket)).toBe(3)
      expect(bucket.objects).toHaveLength(1)
    })

    it.each([
      ['the new index', accumulation(['syn-new']), 200, 'public, max-age=300', ['syn-new']],
      ['parse-error', '{"tags": [', 500, 'no-cache', []],
    ])('releases the old index before reading a changed dictionary; a request during the load waits for %s', async (
      _label,
      nextBody,
      status,
      cacheControl,
      expected,
    ) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const now = vi.spyOn(Date, 'now').mockReturnValue(10_000_000)
      const changed = deferredObject()
      const bucket = sequenceBucket(accumulation(['syn-old']), changed.object)

      expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
      now.mockReturnValue(10_000_000 + TTL_MS)
      // 読み直しを始めた要求は、まだ持っている古い索引で答える
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
      await changed.called

      // 本文を読んでいる間は古い索引を持たないため、この要求は読み込みを待つ
      let settled = false
      const waiting = autocomplete('q=syn', bucket).then((response) => {
        settled = true
        return response
      })
      await flush()
      expect(settled).toBe(false)

      changed.finish(nextBody)
      const response = await waiting
      expect(response.status).toBe(status)
      expect(response.headers.get('Cache-Control')).toBe(cacheControl)
      expect(((await response.json()) as { suggestions: string[] }).suggestions).toEqual(expected)
      expect(tagReads(bucket)).toBe(2)
    })

    it('answers tag-data-loading without caching when a changed dictionary takes longer than the wait', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const now = vi.spyOn(Date, 'now').mockReturnValue(11_000_000)
      const changed = deferredObject()
      const bucket = sequenceBucket(accumulation(['syn-old']), changed.object)

      expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
      now.mockReturnValue(11_000_000 + TTL_MS)
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
      await changed.called

      let settled = false
      const waiting = autocomplete('q=syn', bucket, { Origin: 'https://nico-rank.com' }).then((response) => {
        settled = true
        return response
      })
      await flush()
      await vi.advanceTimersByTimeAsync(WAIT_MS - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)

      const response = await waiting
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Vary')).toBe('Origin')
      expect(await response.json()).toEqual({ query: 'syn', suggestions: [], metadata: { total: 0, source: 'tag-data-loading' } })

      // 読み込みは裏で続き、終われば新しい索引で答える（読み込みは 1 つだけ）
      changed.finish(accumulation(['syn-new']))
      await settle()
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-new'])
      expect(tagReads(bucket)).toBe(2)
    })

    it('answers tag-data-loading when the first load takes longer than the wait', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      vi.spyOn(Date, 'now').mockReturnValue(12_000_000)
      const first = deferredObject()
      const bucket = sequenceBucket(first.object)

      const waiting = autocomplete('q=syn', bucket)
      await flush()
      await vi.advanceTimersByTimeAsync(WAIT_MS)
      const response = await waiting

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('tag-data-loading')

      first.finish(accumulation(['syn-first']))
      await settle()
      expect(await suggestions('q=syn', bucket)).toEqual(['syn-first'])
      expect(tagReads(bucket)).toBe(1)
    })
  })

  it('waits a minute before retrying after a failed refresh, then picks up new data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const now = vi.spyOn(Date, 'now').mockReturnValue(3_000_000)
    const bucket = sequenceBucket(accumulation(['syn-kept']), deniedError(), accumulation(['syn-fresh']))

    await suggestions('q=syn', bucket)
    now.mockReturnValue(3_000_000 + TTL_MS)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
    await settle()
    now.mockReturnValue(3_000_000 + TTL_MS + 59_999)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
    await settle()
    expect(tagReads(bucket)).toBe(2)

    now.mockReturnValue(3_000_000 + TTL_MS + 60_000)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
    await settle()
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-fresh'])
    expect(tagReads(bucket)).toBe(3)
  })

  it.each(['HEAD', 'POST'])('answers %s with 405 without reading R2', async (method) => {
    // HEAD は Sentry が計装していないバインディングで届くため、索引に触れると別の索引ができてしまう
    const bucket = tagBucket()

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/tags/autocomplete?q=syn', { method }),
      greenEnv({ R2_BUCKET: bucket }),
      tagCtx,
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET, OPTIONS')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('answers tag-data-not-found with a 1 minute Cache-Control when there is no index yet', async () => {
    const response = await autocomplete('q=syn', sequenceBucket(null))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('tag-data-not-found')
  })

  it('answers parse-error 500 without caching when there is no index yet, and does not read R2 again for a minute', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(captureWorkerException).mockClear()
    const now = vi.spyOn(Date, 'now').mockReturnValue(13_000_000)
    const bucket = sequenceBucket('not json', accumulation(['syn-fixed']))

    const response = await autocomplete('q=syn', bucket)

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('parse-error')
    expect(captureWorkerException).toHaveBeenCalledTimes(1)

    // 要求ごとに辞書全体を読み直さない
    now.mockReturnValue(13_000_000 + RETRY_MS - 1)
    expect((await autocomplete('q=syn', bucket)).status).toBe(500)
    expect(tagReads(bucket)).toBe(1)
    expect(captureWorkerException).toHaveBeenCalledTimes(1)

    now.mockReturnValue(13_000_000 + RETRY_MS)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-fixed'])
    expect(tagReads(bucket)).toBe(2)
  })

  it('answers 500 for an R2 error when there is no index yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await autocomplete('q=syn', sequenceBucket(deniedError()))

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('error')
  })

  it.each([
    ['q=s', 'query-too-short'],
    ['q=%20%20s%20%20', 'query-too-short'],
    ['', 'query-too-short'],
    [`q=${'a'.repeat(101)}`, 'query-too-long'],
    [`q=%20${'a'.repeat(101)}%20`, 'query-too-long'],
  ])('answers %s without reading R2 (%s)', async (query, source) => {
    const bucket = tagBucket()

    const response = await autocomplete(query, bucket)
    const body = (await response.json()) as { suggestions: string[]; metadata: { total: number; source: string } }

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(body.suggestions).toEqual([])
    expect(body.metadata).toEqual({ total: 0, source })
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('still searches a query of exactly 100 characters', async () => {
    const bucket = tagBucket()

    expect(await suggestions(`q=%20${'a'.repeat(100)}%20`, bucket)).toEqual([])
    expect(tagReads(bucket)).toBe(1)
  })
})
