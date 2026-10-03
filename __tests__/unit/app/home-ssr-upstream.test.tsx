// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import React from 'react'
import type { RankingItem } from '@/types/ranking'

// SSR のランキング取得が、上流（/api/ranking → ゲートウェイ → R2）の一時障害 1 回で
// 利用者を別ページへ飛ばしたり空ページにしたりしないこと

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/lib/ng-filter-server', () => ({
  filterRankingDataServer: vi.fn(async (data: { items: RankingItem[]; popularTags?: string[] }) => ({
    filteredData: { items: data.items, popularTags: data.popularTags },
    newDerivedIds: [],
  })),
}))

vi.mock('@/lib/sentry/capture', () => ({
  captureWebException: vi.fn(),
}))

import Home from '@/app/page'
import ClientPage from '@/app/client-page'

const items: RankingItem[] = Array.from({ length: 3 }, (_, i) => ({
  rank: i + 1,
  id: `sm${800_000 + i}`,
  title: `合成タイトル ${i + 1}`,
  thumbURL: 'https://example.test/thumb.jpg',
  views: 100 - i,
}))

const GREEN_GATEWAY = 'https://nico-ranking-api-gateway-green.yjsn180180.workers.dev'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type AnyElement = React.ReactElement<{ children?: React.ReactNode }>

function findClientPage(node: React.ReactNode): AnyElement | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findClientPage(child)
      if (found) return found
    }
    return null
  }
  const element = node as AnyElement
  if (element.type === ClientPage) return element
  return findClientPage(element.props?.children)
}

const embeddedItems = (tree: React.ReactNode): RankingItem[] => {
  const clientPage = findClientPage(tree)
  if (!clientPage) throw new Error('ClientPage が見つからない')
  return (clientPage.props as unknown as { initialData: { items: RankingItem[] } }).initialData.items
}

const fetchMock = vi.fn()
const originalFetch = global.fetch

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ranking`
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

describe('app/page.tsx: ランキング取得の一時障害', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    redirect.mockClear()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // プレビューは RANKING_SSR_GATEWAY_URL に関わらず公開の Green Worker、それ以外は明示したゲートウェイ → 本番は nico-rank.com
  it.each([
    ['preview', 'https://restricted-gateway.example', GREEN_GATEWAY],
    ['preview', undefined, GREEN_GATEWAY],
    ['production', 'https://ranking.example.test', 'https://ranking.example.test'],
    ['production', undefined, 'https://nico-rank.com'],
    ['development', 'https://ranking.example.test', 'https://ranking.example.test'],
  ])('%sのSSRは保護された自己URLを呼ばずランキングを表示する（RANKING_SSR_GATEWAY_URL=%s）', async (environment, gateway, expectedOrigin) => {
    vi.stubEnv('VERCEL_ENV', environment)
    vi.stubEnv('VERCEL_URL', 'protected.vercel.app')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://protected.vercel.app')
    vi.stubEnv('RANKING_SSR_GATEWAY_URL', gateway)
    fetchMock.mockImplementation(async (url: string) => new URL(url).origin === expectedOrigin
      ? json(200, { items })
      : json(401, { error: 'Authentication required' }))
    const tree = await Home({ searchParams: Promise.resolve({ genre: 'game' }) })
    expect(embeddedItems(tree)).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledWith(`${expectedOrigin}/api/ranking?genre=game&period=24h`, expect.any(Object))
  })

  it('上流が一度だけ 5xx なら再試行して表示し、ジャンルのページから別ページへ飛ばさない', async () => {
    fetchMock
      .mockResolvedValueOnce(json(500, { error: 'Internal server error', message: 'Failed to fetch ranking data' }))
      .mockResolvedValueOnce(json(200, { items, popularTags: ['タグ'] }))

    const tree = await Home({ searchParams: Promise.resolve({ genre: 'game' }) })

    expect(redirect).not.toHaveBeenCalled()
    expect(embeddedItems(tree)).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('通信エラーも 1 回だけ再試行する', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, { items }))

    const tree = await Home({ searchParams: Promise.resolve({}) })

    expect(embeddedItems(tree)).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('4xx は再試行しない（従来どおり総合へ戻す）', async () => {
    fetchMock.mockResolvedValue(json(404, { error: 'Ranking data not found' }))

    await expect(Home({ searchParams: Promise.resolve({ genre: 'game' }) })).rejects.toThrow('NEXT_REDIRECT /')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('上流が本文の途中で止まっても、期限で打ち切って応答する（関数の上限まで待たない）', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.write('{"items":[')
    })
    const upstream = await listen(server)
    // 期限を短くして確かめる
    const realTimeout = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(100))
    global.fetch = ((_input: unknown, init?: RequestInit) => originalFetch(upstream, init)) as typeof fetch
    try {
      const tree = await Home({ searchParams: Promise.resolve({}) })

      // 総合は従来どおり空のページ（ClientPage は出さない）
      expect(findClientPage(tree)).toBeNull()
      expect(redirect).not.toHaveBeenCalled()
    } finally {
      await close(server)
    }
  }, 5_000)
})
