// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// 合成のタグデータ（すべて「合成」を含む 120 件）。上流が limit を超えて返しても件数を守るかも確かめる
const SYNTHETIC_TAGS = Array.from({ length: 120 }, (_, i) => `合成タグ${i + 1}`)

const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()

import { GET } from '@/app/api/tags/autocomplete/route'

async function suggest(query: string) {
  const response = await GET(new NextRequest(`http://localhost/api/tags/autocomplete?${query}`))
  const body = await response.json()
  const [input] = fetchMock.mock.calls[0] ?? []
  const forwardedLimit = input === undefined ? null : new URL(String(input)).searchParams.get('limit')
  return { status: response.status, suggestions: body.suggestions as string[], maxResults: body.metadata.maxResults, forwardedLimit }
}

describe('/api/tags/autocomplete の limit', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () =>
      Response.json({ suggestions: SYNTHETIC_TAGS, metadata: { source: 'r2-tag-accumulation', totalUniqueTags: 120 } }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 応答はルート内でキャッシュされるため、ケースごとにクエリを変える
  it('指定が無ければ 10 件', async () => {
    const { suggestions, forwardedLimit } = await suggest('q=合成1')
    expect(suggestions).toHaveLength(10)
    expect(forwardedLimit).toBe('10')
  })

  it('範囲内の指定はそのまま使う', async () => {
    const { suggestions, maxResults, forwardedLimit } = await suggest('q=合成2&limit=3')
    expect(suggestions).toEqual(['合成タグ1', '合成タグ2', '合成タグ3'])
    expect(maxResults).toBe(3)
    expect(forwardedLimit).toBe('3')
  })

  it('大きすぎる指定は 50 件で打ち切る', async () => {
    const { status, suggestions, maxResults, forwardedLimit } = await suggest('q=合成3&limit=100000')
    expect(status).toBe(200)
    expect(suggestions).toHaveLength(50)
    expect(maxResults).toBe(50)
    expect(forwardedLimit).toBe('50')
  })

  it.each(['-1', '0', 'abc', ''])('不正な指定（%s）は既定の 10 件にする', async (limit) => {
    const { suggestions, maxResults, forwardedLimit } = await suggest(`q=合成4${limit}&limit=${limit}`)
    expect(suggestions).toHaveLength(10)
    expect(maxResults).toBe(10)
    expect(forwardedLimit).toBe('10')
  })
})
