// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/hd-thumbnail/[videoId]/route'

// HD サムネイルは第三者のミラー（nicovideo.gay）を先に読む。ミラーの値は信用せず、
// ニコニコの画像 CDN の https URL だけを返す（クライアントはこの URL をプロキシで保存し、
// だめなら window.open で開く）。使えなければ nicovideo.jp から取る

const VIDEO_ID = 'sm90000001'
const NICOVIDEO_OG_IMAGE =
  'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/90000001/90000001.original/r1280x720l?key=synthetic-key'

const page = (meta: string) =>
  new Response(`<!doctype html><html><head>${meta}</head><body></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
const ogImage = (url: string) => `<meta property="og:image" content="${url}" />`

const fetchMock = vi.fn()
const realFetch = globalThis.fetch
const requestedHosts = (): string[] => fetchMock.mock.calls.map(([input]) => new URL(String(input)).hostname)

async function callRoute(videoId = VIDEO_ID) {
  const response = await GET(new NextRequest(`http://localhost/api/hd-thumbnail/${videoId}`), {
    params: Promise.resolve({ videoId }),
  })
  return { response, body: await response.json() }
}

function upstream(mirror: () => Response | Promise<Response>, nicovideo: () => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (input: unknown) => {
    const host = new URL(String(input)).hostname
    if (host === 'www.nicovideo.gay') return mirror()
    if (host === 'www.nicovideo.jp') return nicovideo()
    throw new Error(`unexpected host: ${host}`)
  })
}

describe('/api/hd-thumbnail/[videoId]', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ['javascript: URL', 'javascript:alert(document.domain)'],
    ['ニコニコ以外のホスト', 'https://tracker.example/thumbnail.jpg'],
    ['http の CDN', 'http://img.cdn.nimg.jp/s/nicovideo/thumbnails/90000001/90000001.original/r1280x720l'],
  ])('ミラーの og:image が %s なら返さず、nicovideo.jp の値を返す', async (_label, mirrorImage) => {
    upstream(
      () => page(ogImage(mirrorImage)),
      () => page(ogImage(NICOVIDEO_OG_IMAGE))
    )

    const { response, body } = await callRoute()

    expect(response.status).toBe(200)
    expect(body.thumbnail).toBe(NICOVIDEO_OG_IMAGE)
    expect(response.headers.get('X-HD-Source')).toBe('nicovideo.jp')
  })

  it('ミラーが og:image の無いページを 200 で返したら、nicovideo.jp から取る', async () => {
    upstream(
      () => page('<title>not found</title>'),
      () => page(ogImage(NICOVIDEO_OG_IMAGE))
    )

    const { body } = await callRoute()

    expect(body.thumbnail).toBe(NICOVIDEO_OG_IMAGE)
    expect(requestedHosts()).toEqual(['www.nicovideo.gay', 'www.nicovideo.jp'])
  })

  it('nicovideo.jp の値も CDN の URL でなければ thumbnail は null', async () => {
    upstream(
      () => new Response('error', { status: 500 }),
      () => page(ogImage('https://tracker.example/thumbnail.jpg'))
    )

    const { response, body } = await callRoute()

    expect(response.status).toBe(200)
    expect(body.thumbnail).toBeNull()
    expect(body.resolution).toBe('Not available')
  })

  it('ミラーの CDN の URL はそのまま使い（.original へ寄せる）、nicovideo.jp は読まない', async () => {
    upstream(
      () => page(ogImage('https://nicovideo.cdn.nimg.jp/thumbnails/90000001/90000001.12345.M')),
      () => page(ogImage(NICOVIDEO_OG_IMAGE))
    )

    const { response, body } = await callRoute()

    expect(body.thumbnail).toBe('https://nicovideo.cdn.nimg.jp/thumbnails/90000001/90000001.12345.original')
    expect(response.headers.get('X-HD-Source')).toBe('nicovideo.gay')
    expect(requestedHosts()).toEqual(['www.nicovideo.gay'])
  })

  it('so 動画はミラーを読まずに nicovideo.jp から取る', async () => {
    upstream(
      () => page(ogImage('https://nicovideo.cdn.nimg.jp/thumbnails/1/1.1.M')),
      () => page(ogImage(NICOVIDEO_OG_IMAGE))
    )

    const { body } = await callRoute('so90000001')

    expect(body.thumbnail).toBe(NICOVIDEO_OG_IMAGE)
    expect(requestedHosts()).toEqual(['www.nicovideo.jp'])
  })

  it('ss 動画の公式 goptim サムネイルを署名・サイズ指定ごと保持する', async () => {
    const thumbnail = 'https://goptim.video.nimg.jp/thumbnail/1280x720?i=46678223.20245450&s=blur&key=synthetic-key'
    upstream(
      () => page('<title>not found</title>'),
      () => page(ogImage(thumbnail.replaceAll('&', '&amp;')))
    )
    const { body } = await callRoute('ss46678223')
    expect(body.thumbnail).toBe(thumbnail)
    expect(body.source).toBe('nicovideo.jp og:image')
  })

  it('ミラーが応答を途中で止めても、期限で打ち切って nicovideo.jp から取る', async () => {
    const server: Server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.write('<html><head>')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const stalledMirror = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
    // 期限を短くして確かめる
    const realTimeout = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(100))
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) =>
      new URL(String(input)).hostname === 'www.nicovideo.gay'
        ? realFetch(stalledMirror, init)
        : page(ogImage(NICOVIDEO_OG_IMAGE))
    )
    try {
      const { body } = await callRoute()

      expect(body.thumbnail).toBe(NICOVIDEO_OG_IMAGE)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 5_000)
})
