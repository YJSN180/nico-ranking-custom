// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { NextRequest } from 'next/server'
import type { RankingItem } from '@/types/ranking'

vi.mock('@/lib/ng-filter-server', () => ({
  filterRankingDataServer: vi.fn(async (data: { items: RankingItem[]; popularTags?: string[] }) => ({
    filteredData: { items: data.items, popularTags: data.popularTags },
    newDerivedIds: [],
  })),
}))

vi.mock('@/lib/sentry/capture', () => ({
  captureWebException: vi.fn(),
}))

import { GET } from '@/app/api/ranking/full/route'

const items: RankingItem[] = Array.from({ length: 3 }, (_, i) => ({
  rank: i + 1,
  id: `sm${900_000 + i}`,
  title: `合成タイトル ${i + 1}`,
  thumbURL: 'https://example.test/thumb.jpg',
  views: 100 - i,
}))

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fetchMock = vi.fn()
const realFetch = globalThis.fetch
const request = () => new NextRequest('http://localhost/api/ranking/full?genre=game&period=24h')

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ranking`
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

describe('/api/ranking/full と上流の一時障害', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('本番では保護されたデプロイ URL ではなく SSR ゲートウェイから取得する', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('RANKING_SSR_GATEWAY_URL', 'https://ranking-gateway.example')
    fetchMock.mockResolvedValue(json(200, { items }))
    const response = await GET(new NextRequest('https://protected.example/api/ranking/full?genre=game&period=hour&tag=tag'))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ranking-gateway.example/api/ranking?genre=game&period=hour&tag=tag',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'nico-ranking-web/1.0' }) })
    )
  })

  it('上流が一度だけ 5xx（R2 の一時障害）なら再試行して全件を返す', async () => {
    fetchMock
      .mockResolvedValueOnce(json(500, { error: 'Internal server error', message: 'Failed to fetch ranking data' }))
      .mockResolvedValueOnce(json(200, { items, popularTags: ['タグ'] }))

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect((await response.json()).items).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('4xx は再試行せずに 502 を返す', async () => {
    fetchMock.mockResolvedValue(json(404, { error: 'Ranking data not found' }))

    const response = await GET(request())

    expect(response.status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ヘッダーのあと本文が届き切らない上流でも、期限で打ち切って応答する', async () => {
    // ヘッダーと本文の一部だけ送って止まる上流
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.write('{"items":[')
    })
    const upstream = await listen(server)
    // 30 秒の期限を短くして確かめる（ヘッダー受信で期限を外すと本文の待ちが無期限になる）
    const realTimeout = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(100))
    vi.stubGlobal('fetch', (_input: unknown, init?: RequestInit) => realFetch(upstream, init))
    try {
      const response = await GET(request())

      expect(response.status).toBe(500)
      expect(await response.json()).toMatchObject({ type: 'hydrate_error' })
    } finally {
      await close(server)
    }
  }, 5_000)
})
