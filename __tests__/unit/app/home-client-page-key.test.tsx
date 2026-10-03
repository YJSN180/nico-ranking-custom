import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import type { RankingItem } from '@/types/ranking'

// H6: ホーム・ロゴでの遷移でサーバーから新しい props が来たとき、ClientPage を作り直すこと。
// 同じインスタンスのまま props だけ替わると、全件の補完（マウント時のみ）が走らず
// 一覧が 1 ページ目の埋め込み（100 件）に縮み、ページ送りが消える。

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

const makeItems = (prefix: string, count: number): RankingItem[] =>
  Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    id: `${prefix}${i + 1}`,
    title: `合成タイトル ${prefix}${i + 1}`,
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1000 - i,
  }))

let responseItems: RankingItem[] = []

const originalFetch = global.fetch

beforeEach(() => {
  responseItems = makeItems('sm', 300)
  global.fetch = vi.fn(async () => {
    const body = { items: responseItems, popularTags: [] }
    const res = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => body,
      text: async () => JSON.stringify(body),
      clone: () => res,
    }
    return res as unknown as Response
  }) as unknown as typeof fetch
})

afterEach(() => {
  global.fetch = originalFetch
})

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

async function renderKey(searchParams: Record<string, string>): Promise<{ key: string | null; embedded: number }> {
  const tree = await Home({ searchParams: Promise.resolve(searchParams) })
  const clientPage = findClientPage(tree)
  if (!clientPage) throw new Error('ClientPage が見つからない')
  const props = clientPage.props as unknown as { initialData: { items: RankingItem[] } }
  return { key: clientPage.key, embedded: props.initialData.items.length }
}

describe('app/page.tsx: ClientPage の key（H6）', () => {
  it('ClientPage に key を付け、埋め込みは 1 ページ分（100 件）にする', async () => {
    const { key, embedded } = await renderKey({})
    expect(key).toBeTruthy()
    expect(embedded).toBe(100)
  })

  it('ジャンル・期間・タグが違えば key も違う（遷移で作り直される）', async () => {
    const base = (await renderKey({})).key
    expect((await renderKey({ genre: 'game' })).key).not.toBe(base)
    expect((await renderKey({ period: 'hour' })).key).not.toBe(base)
    expect((await renderKey({ tag: '合成タグ' })).key).not.toBe(base)
  })

  it('同じ条件でもランキングの中身が更新されていれば key が変わる（ロゴで開き直したとき縮まない）', async () => {
    const before = (await renderKey({})).key
    // 1 位は同じで、途中の順位だけが入れ替わった更新
    const updated = makeItems('sm', 300)
    ;[updated[150], updated[151]] = [updated[151], updated[150]]
    responseItems = updated
    expect((await renderKey({})).key).not.toBe(before)
  })

  it('同じ条件・同じ中身なら key は変わらない（無駄に作り直さない）', async () => {
    const first = (await renderKey({ genre: 'game' })).key
    const second = (await renderKey({ genre: 'game' })).key
    expect(second).toBe(first)
  })
})
