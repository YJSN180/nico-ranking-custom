// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// og:url は共有したときの正規の URL。どの組み合わせの指定でも、ホストは nico-rank.com のまま
// クエリに genre・period・tag が入ること（以前は period だけだと https://nico-rank.com&period=hour になった）

vi.mock('@/lib/ng-filter-server', () => ({
  filterRankingDataServer: vi.fn(),
}))

vi.mock('@/lib/sentry/capture', () => ({
  captureWebException: vi.fn(),
}))

import { generateMetadata } from '@/app/page'

async function ogUrl(searchParams: Record<string, string>): Promise<URL> {
  const metadata = await generateMetadata({ searchParams: Promise.resolve(searchParams) })
  const url = metadata.openGraph?.url
  if (typeof url !== 'string') throw new Error('openGraph.url が文字列でない')
  return new URL(url)
}

describe('app/page.tsx: og:url', () => {
  it('指定が無ければクエリを付けない', async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) })
    expect(metadata.openGraph?.url).toBe('https://nico-rank.com')
  })

  it.each([
    [{ period: 'hour' }],
    [{ tag: '合成タグ' }],
    [{ period: 'hour', tag: '合成タグ' }],
    [{ genre: 'game' }],
    [{ genre: 'game', period: 'hour', tag: '合成タグ' }],
  ])('%o でもホストは nico-rank.com で、指定がクエリに入る', async (searchParams: Record<string, string>) => {
    const url = await ogUrl(searchParams)

    expect(url.host).toBe('nico-rank.com')
    expect(url.pathname).toBe('/')
    expect(Object.fromEntries(url.searchParams)).toEqual(searchParams)
  })

  it('記号を含むタグも 1 つの値として往復する', async () => {
    const tag = '合成 A&B=C?#'
    const url = await ogUrl({ genre: 'game', tag })

    expect(url.host).toBe('nico-rank.com')
    expect(url.searchParams.get('tag')).toBe(tag)
    expect(url.searchParams.get('genre')).toBe('game')
  })
})
