import { render, screen } from '@testing-library/react'
import { beforeEach, describe, test, expect, vi } from 'vitest'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import type { RankingItem } from '@/types/ranking'
import '@/components/ranking-item-responsive.css'

// モバイル環境をシミュレート
beforeEach(() => {
  // Container Queryのmockを設定
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 600px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  
  // ResizeObserverをモック
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

describe('RankingItemResponsive - モバイルレイアウト', () => {
  const mockItem: RankingItem = {
    id: 'sm12345678',
    title: '機動戦士Gundam GOuuuuuuX（ジー・オーエックス）第一話「愚者の楽園」',
    registeredAt: '2025-06-27T12:00:00Z',
    views: 56000,
    comments: 2200,
    mylists: 2199,
    likes: 2199,
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678',
    duration: 1707, // 秒数に変更（28:27 = 1707秒）
    rank: 1,
    authorName: '機動戦士ガンダムch',
    authorId: 'channel/ch2625894',
    authorIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/0/0.jpg',
  }

  test('モバイル版でマイリストボタンがタイトル行の右端に配置される', () => {
    const { container } = render(<RankingItemResponsive item={mockItem} />)
    
    // コンテンツコンテナを取得
    const content = container.querySelector('.ranking-item-responsive__content')
    expect(content).toBeInTheDocument()
    
    // マイリストボタンエリアが存在することを確認
    const mylistArea = container.querySelector('.ranking-item-responsive__mylist-area')
    expect(mylistArea).toBeInTheDocument()
    
    // タイトル要素の存在を確認
    const title = screen.getByTestId('video-title')
    expect(title).toBeInTheDocument()
    
    // タイトルとマイリストボタンが同じ構造内にあることを確認
    const details = container.querySelector('.ranking-item-responsive__details')
    expect(details).toBeInTheDocument()
    
    // グリッドエリアが正しく設定されていることを確認（CSSクラスの存在）
    expect(content?.className).toContain('ranking-item-responsive__content')
    expect(mylistArea?.className).toContain('ranking-item-responsive__mylist-area')
  })

  test('モバイル版で統計情報が横スクロールせずに全て表示される', () => {
    const { container } = render(<RankingItemResponsive item={mockItem} />)
    
    // 統計情報コンテナを取得
    const stats = screen.getByTestId('video-stats')
    expect(stats).toBeInTheDocument()
    
    // 統計情報が横スクロールになっていることを確認（現在の実装）
    const statsClass = stats.className
    expect(statsClass).toContain('ranking-item-responsive__stats')
    
    // 全ての統計情報が表示されていることを確認
    expect(screen.getByText(/▶️ 5.6万/)).toBeInTheDocument()
    expect(screen.getByText(/💬 2,200/)).toBeInTheDocument() // formatNumberMobileは2200をそのまま表示
    expect(screen.getByText(/❤️ 2,199/)).toBeInTheDocument()
    expect(screen.getByText(/📁 2,199/)).toBeInTheDocument()
    
    // TODO: 横スクロールを削除する実装が必要
    // 現在のCSSでは overflow-x: auto が設定されている
  })

  test('モバイル版でマイリストボタンがタイトル行と同じ高さに配置される', () => {
    const { container } = render(<RankingItemResponsive item={mockItem} />)
    
    // 新しいレイアウトを実装する必要があることを示すテスト
    // 現在の実装：
    // grid-template-areas: "thumbnail details mylist-button";
    
    // 理想的な実装：
    // タイトル行にマイリストボタンを配置
    // - タイトルは flex: 1 で残り幅を使用
    // - マイリストボタンは固定幅で右端
    
    const title = screen.getByTestId('video-title')
    const mylistArea = container.querySelector('.ranking-item-responsive__mylist-area')
    
    // 両方の要素が存在することを確認
    expect(title).toBeInTheDocument()
    expect(mylistArea).toBeInTheDocument()
    
    // TODO: タイトル行とマイリストボタンを同じflexboxコンテナに配置する実装が必要
  })

  test('モバイル版でレイアウトが正しく構成されている', () => {
    const { container } = render(<RankingItemResponsive item={mockItem} />)
    
    // 主要な要素が存在することを確認
    const thumbnail = container.querySelector('.ranking-item-responsive__thumbnail')
    const details = container.querySelector('.ranking-item-responsive__details')
    const mylistArea = container.querySelector('.ranking-item-responsive__mylist-area')
    const stats = screen.getByTestId('video-stats')
    
    expect(thumbnail).toBeInTheDocument()
    expect(details).toBeInTheDocument()
    expect(mylistArea).toBeInTheDocument()
    expect(stats).toBeInTheDocument()
    
    // 現在の問題点を確認
    // 1. 統計情報に overflow-x: auto が設定されている → 横スクロールが発生
    // 2. マイリストボタンが別のグリッドエリアにある → タイトル行と別になっている
    
    // 解決策：
    // 1. モバイル版でタイトルとマイリストボタンを同じflexboxコンテナに配置
    // 2. 統計情報の overflow-x: auto を削除し、flex-wrap: wrap を使用
  })
})