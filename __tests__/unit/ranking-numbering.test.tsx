import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import ClientPage from '@/app/client-page'
import type { RankingItem } from '@/types'

// Next.js のモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

// fetchのモック
global.fetch = vi.fn()

describe('ランキング順位のナンバリング検証', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('初期表示で順位が連続していることを確認', () => {
    const testData: RankingItem[] = [
      { id: '1', title: 'Video 1', rank: 1, thumbURL: 'https://example.com/1.jpg', views: 1000 },
      { id: '2', title: 'Video 2', rank: 2, thumbURL: 'https://example.com/2.jpg', views: 900 },
      { id: '3', title: 'Video 3', rank: 3, thumbURL: 'https://example.com/3.jpg', views: 800 },
      { id: '4', title: 'Video 4', rank: 4, thumbURL: 'https://example.com/4.jpg', views: 700 },
      { id: '5', title: 'Video 5', rank: 5, thumbURL: 'https://example.com/5.jpg', views: 600 }
    ]

    render(
      <ClientPage
        initialData={testData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 順位表示を確認（数字のみで表示される）
    for (let i = 1; i <= 5; i++) {
      const rankElement = screen.getByText(i.toString())
      expect(rankElement).toBeInTheDocument()
    }
  })

  it('サーバー側でフィルタ済みデータの順位が連続して表示されることを確認', () => {
    // サーバー側で既にフィルタされて、一部の順位が欠番になっているデータ
    // (NGフィルタテストは別のテストファイルで行う)
    const testData: RankingItem[] = [
      { id: '1', title: 'Video 1', rank: 1, thumbURL: 'https://example.com/1.jpg', views: 1000 },
      { id: '3', title: 'Video 3', rank: 3, thumbURL: 'https://example.com/3.jpg', views: 800 }, // 2位が欠番
      { id: '4', title: 'Video 4', rank: 4, thumbURL: 'https://example.com/4.jpg', views: 700 },
      { id: '5', title: 'Video 5', rank: 5, thumbURL: 'https://example.com/5.jpg', views: 600 }
    ]

    render(
      <ClientPage
        initialData={testData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // クライアント側で連続した順位に再割り当てされることを確認
    // 元の順位: 1, 3, 4, 5 → 表示順位: 1, 2, 3, 4
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()

    // 表示される動画の確認
    expect(screen.getByText('Video 1')).toBeInTheDocument()
    expect(screen.getByText('Video 3')).toBeInTheDocument()
    expect(screen.getByText('Video 4')).toBeInTheDocument()
    expect(screen.getByText('Video 5')).toBeInTheDocument()
  })

  it('不連続な順位データが入力されても表示時は連続になることを確認', () => {
    // サーバー側で既にNGフィルタが適用されて順位が飛んでいるデータ
    const testData: RankingItem[] = [
      { id: '1', title: 'Video 1', rank: 1, thumbURL: 'https://example.com/1.jpg', views: 1000 },
      { id: '3', title: 'Video 3', rank: 3, thumbURL: 'https://example.com/3.jpg', views: 800 }, // 2位が欠番
      { id: '5', title: 'Video 5', rank: 5, thumbURL: 'https://example.com/5.jpg', views: 600 }, // 4位が欠番
      { id: '7', title: 'Video 7', rank: 7, thumbURL: 'https://example.com/7.jpg', views: 400 }, // 6位が欠番
    ]

    render(
      <ClientPage
        initialData={testData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // クライアント側で連続した順位に再割り当てされることを確認
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()

    // 元のランク番号5,7は表示されず、連続した順位になっている
    expect(screen.queryByText('5')).not.toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('大量データでも順位が正しく割り当てられることを確認', () => {
    // 100件のテストデータを生成（一部欠番あり）
    const testData: RankingItem[] = []
    let actualRank = 1
    
    for (let i = 1; i <= 120; i++) {
      // 10, 20, 30... の倍数を欠番にする（サーバー側NGフィルタを想定）
      if (i % 10 === 0) continue
      
      testData.push({
        id: i.toString(),
        title: `Video ${i}`,
        rank: i, // 元の順位（欠番あり）
        thumbURL: `https://example.com/${i}.jpg`,
        views: 2000 - i
      })
      actualRank++
      
      // 100件まで
      if (testData.length >= 100) break
    }

    render(
      <ClientPage
        initialData={testData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 最初の10件の順位が連続していることを確認
    for (let i = 1; i <= 10; i++) {
      const rankElement = screen.getByText(i.toString())
      expect(rankElement).toBeInTheDocument()
    }

    // 欠番がないことを確認（特定の欠番パターンをチェック）
    // 元データで10位は欠番だったが、表示では10位が存在する
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('ランキング項目の表示順序が rank プロパティ順になっていることを確認', () => {
    // 意図的にrank順序と配列順序を異なるものにする
    const testData: RankingItem[] = [
      { id: '3', title: 'Video 3', rank: 3, thumbURL: 'https://example.com/3.jpg', views: 800 },
      { id: '1', title: 'Video 1', rank: 1, thumbURL: 'https://example.com/1.jpg', views: 1000 },
      { id: '5', title: 'Video 5', rank: 5, thumbURL: 'https://example.com/5.jpg', views: 600 },
      { id: '2', title: 'Video 2', rank: 2, thumbURL: 'https://example.com/2.jpg', views: 900 },
      { id: '4', title: 'Video 4', rank: 4, thumbURL: 'https://example.com/4.jpg', views: 700 }
    ]

    render(
      <ClientPage
        initialData={testData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // DOM上での表示順序を確認
    const rankingItems = screen.getAllByText(/Video \d/)
    const titles = rankingItems.map(item => item.textContent)
    
    // rank順でソートされて表示されることを確認
    expect(titles).toEqual(['Video 1', 'Video 2', 'Video 3', 'Video 4', 'Video 5'])
  })

  it('100位表示で89位が重複表示されないことを確認', () => {
    // 実際に報告された問題：100位に89位が表示される問題の回帰テスト
    const testData: RankingItem[] = []
    
    // 100件のデータを生成（89-91番目に注目）
    for (let i = 1; i <= 110; i++) {
      testData.push({
        id: i.toString(),
        title: `Video ${i}`,
        rank: i,
        thumbURL: `https://example.com/${i}.jpg`,
        views: 2000 - i
      })
    }

    render(
      <ClientPage
        initialData={testData.slice(0, 100)} // 最初の100件
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 89位、90位、100位がそれぞれ一回ずつしか表示されないことを確認
    const rank89Elements = screen.getAllByText('89')
    const rank90Elements = screen.getAllByText('90')
    const rank100Elements = screen.getAllByText('100')
    
    expect(rank89Elements).toHaveLength(1)
    expect(rank90Elements).toHaveLength(1)
    expect(rank100Elements).toHaveLength(1)

    // 100位に表示される動画が「Video 100」であることを確認
    const rank100Element = screen.getByText('100')
    const videoContainer = rank100Element.closest('[data-testid="ranking-item"]') || rank100Element.closest('li')
    expect(videoContainer).toHaveTextContent('Video 100')
  })
})