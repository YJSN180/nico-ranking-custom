// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 合成のタグデータ（すべて「合成」を含む 120 件）で limit の扱いを確かめる
const SYNTHETIC_TAGS = Array.from({ length: 120 }, (_, i) => `合成タグ${i + 1}`)

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() =>
      JSON.stringify({
        tags: SYNTHETIC_TAGS,
        metadata: { version: 2, lastUpdated: '2026-01-01T00:00:00.000Z', totalUniqueTags: 120, lastAccumulationSource: 'test' },
      })
    ),
  }
})

import { GET } from '@/app/api/tags/autocomplete/route'

async function suggest(query: string) {
  const response = await GET(new NextRequest(`http://localhost/api/tags/autocomplete?${query}`))
  const body = await response.json()
  return { status: response.status, suggestions: body.suggestions as string[], maxResults: body.metadata.maxResults }
}

describe('/api/tags/autocomplete の limit', () => {
  it('指定が無ければ 10 件', async () => {
    const { suggestions } = await suggest('q=合成')
    expect(suggestions).toHaveLength(10)
  })

  it('範囲内の指定はそのまま使う', async () => {
    const { suggestions, maxResults } = await suggest('q=合成&limit=3')
    expect(suggestions).toEqual(['合成タグ1', '合成タグ2', '合成タグ3'])
    expect(maxResults).toBe(3)
  })

  it('大きすぎる指定は 50 件で打ち切る', async () => {
    const { status, suggestions, maxResults } = await suggest('q=合成&limit=100000')
    expect(status).toBe(200)
    expect(suggestions).toHaveLength(50)
    expect(maxResults).toBe(50)
  })

  it.each(['-1', '0', 'abc', ''])('不正な指定（%s）は既定の 10 件にする', async (limit) => {
    const { suggestions, maxResults } = await suggest(`q=合成&limit=${limit}`)
    expect(suggestions).toHaveLength(10)
    expect(maxResults).toBe(10)
  })
})
