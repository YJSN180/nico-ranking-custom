// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// /api/popular-tags がどの上流へ問い合わせるかを、実際の lib/popular-tags（とその依存）で確かめる。
// 小キー（POPULAR_TAGS_LATEST）は未生成とし、ゲートウェイ経路が使えない場合を再現する
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(async () => null),
    getStrict: vi.fn(async () => null),
  },
}))

import { GET } from '@/app/api/popular-tags/route'

const fetchMock = vi.fn()
const requestedUrls = (): URL[] => fetchMock.mock.calls.map(([input]) => new URL(String(input)))

describe('/api/popular-tags の上流への問い合わせ', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ジャンルに入れたパスで、ニコニコ側（nvapi）の任意のパスへ問い合わせない', async () => {
    fetchMock.mockImplementation(async () => new Response('not found', { status: 404 }))

    const response = await GET(
      new NextRequest('http://localhost/api/popular-tags?genre=..%2F..%2Fv1%2Fusers%2Fme&period=24h')
    )

    expect(await response.json()).toEqual({ tags: [] })
    expect(requestedUrls().map((url) => url.hostname)).not.toContain('nvapi.nicovideo.jp')
  })

  it('ゲートウェイが失敗しても、人気タグを返せない nvapi のランキング取得を待たずに空で応答する', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (new URL(String(input)).hostname === 'nvapi.nicovideo.jp') {
        // 応答しない上流（タイムアウトの無い取得はここで止まる）
        return new Promise<Response>(() => {})
      }
      return new Response('unavailable', { status: 503 })
    })

    const response = await GET(new NextRequest('http://localhost/api/popular-tags?genre=game&period=24h'))

    expect(await response.json()).toEqual({ tags: [] })
    expect(requestedUrls().map((url) => url.hostname)).not.toContain('nvapi.nicovideo.jp')
  }, 2_000)
})
