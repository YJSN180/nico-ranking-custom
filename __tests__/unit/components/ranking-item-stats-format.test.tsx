import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { describe, it, expect, vi } from 'vitest'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import { formatNumberMobile, formatNumberCompact } from '@/lib/format-utils'
import type { RankingItem } from '@/types/ranking'

// X-d: 統計の数値は PC では main の書式（12.3万 / 12345.6万）のまま。
// 1 行に収めるための圧縮表記（12万 / 1.2億）はモバイル（幅 640px 以下）だけで使う。

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
      updatedAt: new Date().toISOString()
    },
    saveNGListDirectly: vi.fn()
  })
}))

describe('formatNumberMobile（PC の統計。main と同じ書式）', () => {
  it('1万以上は小数第1位までの万表記、億には繰り上げない', () => {
    expect(formatNumberMobile(9999)).toBe('9,999')
    expect(formatNumberMobile(56000)).toBe('5.6万')
    expect(formatNumberMobile(123456)).toBe('12.3万')
    expect(formatNumberMobile(123456789)).toBe('12345.6万')
  })
})

describe('formatNumberCompact（モバイルの統計。1 行に収める圧縮表記）', () => {
  it('10万以上は小数を省き、1億以上は億表記にする', () => {
    expect(formatNumberCompact(9999)).toBe('9,999')
    expect(formatNumberCompact(56000)).toBe('5.6万')
    expect(formatNumberCompact(123456)).toBe('12万')
    expect(formatNumberCompact(123456789)).toBe('1.2億')
  })
})

describe('RankingItemResponsive の統計表示', () => {
  const item: RankingItem = {
    id: 'sm90000002',
    rank: 5,
    title: '合成タイトル',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 123456789,
    comments: 123456,
    likes: 56000,
    mylists: 2200
  }

  const renderItem = () =>
    render(
      <TagDisplayProvider>
        <RankingItemResponsive item={item} />
      </TagDisplayProvider>
    )

  it('書式が違う数値は PC 用とモバイル用を出し分ける（CSS で幅により片方だけ表示）', () => {
    const { container } = renderItem()
    const desktop = Array.from(container.querySelectorAll('.ranking-item-responsive__stat-value--desktop')).map((el) => el.textContent)
    const mobile = Array.from(container.querySelectorAll('.ranking-item-responsive__stat-value--mobile')).map((el) => el.textContent)
    expect(desktop).toEqual(['12345.6万', '12.3万'])
    expect(mobile).toEqual(['1.2億', '12万'])
  })

  it('書式が同じ数値は 1 つだけ出す', () => {
    renderItem()
    expect(screen.getAllByText('5.6万')).toHaveLength(1)
    expect(screen.getAllByText('2,200')).toHaveLength(1)
  })

  it('PC の表示は main と同じく「アイコン 数値」の間に空白を入れる', () => {
    const { container } = renderItem()
    const stat = container.querySelectorAll('.ranking-item-responsive__stat')[2]
    expect(stat?.textContent).toBe('❤️ 5.6万')
  })
})
