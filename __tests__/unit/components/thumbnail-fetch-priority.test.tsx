import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { OptimizedImage } from '@/components/optimized-image'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import type { RankingItem } from '@/types/ranking'

// LCP: 先頭のサムネイルは、サーバーが返す HTML の時点で fetchpriority="high" を持つ。
// 以前は ref でハイドレーション後に属性を付けており、その時点では画像の取得がもう
// 始まっている（HTML の解析時に既定の優先度で要求済み）ため効いていなかった。

vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      tags: {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      },
      version: 2,
      totalCount: 0,
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    saveNGListDirectly: vi.fn()
  })
}))

function item(rank: number): RankingItem {
  return {
    id: `sm9000040${rank}`,
    rank,
    title: `合成タイトル${rank}`,
    thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/9000040${rank}/9000040${rank}.1`,
    views: 10,
    comments: 1,
    mylists: 1,
    likes: 1,
    authorId: `9000040${rank}`,
    authorName: '合成投稿者'
  }
}

function thumbnailTag(rank: number): string {
  const html = renderToString(
    <TagDisplayProvider>
      <RankingItemResponsive item={item(rank)} />
    </TagDisplayProvider>
  )
  return html.match(/<img[^>]*nimg\.jp\/thumbnails[^>]*>/)?.[0] ?? ''
}

describe('ランキング行のサムネイルの取得優先度（SSR）', () => {
  it('前提: サムネイルの img が HTML にある', () => {
    expect(thumbnailTag(1)).not.toBe('')
  })

  it('1 位のサムネイルは HTML の時点で fetchpriority="high" を持つ', () => {
    expect(thumbnailTag(1)).toMatch(/fetchpriority="high"/i)
  })

  it('2 位以降には付けない（高優先は先頭の 1 枚だけ）', () => {
    expect(thumbnailTag(2)).not.toMatch(/fetchpriority/i)
    expect(thumbnailTag(4)).not.toMatch(/fetchpriority/i)
  })

  it('上位 3 件は従来どおり遅延読み込みにしない', () => {
    expect(thumbnailTag(1)).not.toMatch(/loading="lazy"/)
    expect(thumbnailTag(3)).not.toMatch(/loading="lazy"/)
    expect(thumbnailTag(4)).toMatch(/loading="lazy"/)
  })
})

describe('OptimizedImage の priority（ニコニコの CDN 画像）', () => {
  const src = 'https://nicovideo.cdn.nimg.jp/thumbnails/90000499/90000499.1'

  it('priority のときは HTML の時点で fetchpriority="high" を持つ', () => {
    const html = renderToString(<OptimizedImage src={src} alt="" width={160} height={90} priority />)
    expect(html).toMatch(/fetchpriority="high"/i)
  })

  it('priority でなければ fetchpriority を付けない（ブラウザの既定に任せる）', () => {
    const html = renderToString(<OptimizedImage src={src} alt="" width={160} height={90} />)
    expect(html).not.toMatch(/fetchpriority/i)
  })
})
