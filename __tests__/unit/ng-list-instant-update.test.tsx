import React from 'react'
import { vi } from 'vitest'
import { render, screen, waitFor, act } from '@/__tests__/test-utils'
import '@testing-library/jest-dom'
import ClientPage from '@/app/client-page'

// モックデータ
const mockRankingData = [
  {
    id: 'sm12345678',
    rank: 1,
    title: 'テスト動画1',
    authorId: 'author1',
    authorName: '投稿者1',
    thumbURL: 'https://example.com/thumb1.jpg',
    views: 1000,
    comments: 100,
    mylists: 10,
    likes: 50,
    length: 300,
    registeredAt: '2025-01-01T00:00:00.000Z'
  },
  {
    id: 'sm87654321',
    rank: 2,
    title: 'NGワード含む動画',
    authorId: 'author2',
    authorName: '投稿者2',
    thumbURL: 'https://example.com/thumb2.jpg',
    views: 900,
    comments: 90,
    mylists: 9,
    likes: 45,
    length: 400,
    registeredAt: '2025-01-01T01:00:00.000Z'
  },
  {
    id: 'sm11111111',
    rank: 3,
    title: 'テスト動画3',
    authorId: 'author3',
    authorName: 'NG投稿者',
    thumbURL: 'https://example.com/thumb3.jpg',
    views: 800,
    comments: 80,
    mylists: 8,
    likes: 40,
    length: 500,
    registeredAt: '2025-01-01T02:00:00.000Z'
  },
  {
    id: 'sm22222222',
    rank: 4,
    title: 'テスト動画4',
    authorId: 'author4',
    authorName: '投稿者4',
    thumbURL: 'https://example.com/thumb4.jpg',
    views: 700,
    comments: 70,
    mylists: 7,
    likes: 35,
    length: 600,
    registeredAt: '2025-01-01T03:00:00.000Z'
  }
]

describe('NGリスト即時反映テスト', () => {
  beforeEach(() => {
    // localStorage をクリア
    localStorage.clear()
  })

  test('NGリスト適用時に即座にランキングが再計算される', async () => {
    // ClientPageをレンダリング
    render(
      <ClientPage 
        initialData={{ items: mockRankingData }} 
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 初期状態：4件すべて表示される
    expect(screen.getByText('テスト動画1')).toBeInTheDocument()
    expect(screen.getByText('NGワード含む動画')).toBeInTheDocument()
    expect(screen.getByText('テスト動画3')).toBeInTheDocument()
    expect(screen.getByText('テスト動画4')).toBeInTheDocument()

    // NGリストをlocalStorageに直接設定
    const ngListData = {
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: ['NGワード'],
      },
      authorIds: [],
      authorNames: {
        exact: ['NG投稿者'],
        partial: [],
      },
      version: 1,
      totalCount: 2,
      updatedAt: new Date().toISOString(),
    }

    // localStorageに保存してイベントを発火
    act(() => {
      localStorage.setItem('user-ng-list', JSON.stringify(ngListData))
      // ngListUpdatedイベントを発火
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { ngList: ngListData } 
      }))
    })

    // NGリストが即座に適用されることを確認
    await waitFor(() => {
      // NGワードを含む動画が非表示になる
      expect(screen.queryByText('NGワード含む動画')).not.toBeInTheDocument()
      expect(screen.queryByText('NG投稿者')).not.toBeInTheDocument()
      
      // 他の動画は表示される
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.getByText('テスト動画4')).toBeInTheDocument()
    }, { timeout: 1000 }) // 1秒以内に反映されるべき
  })

  test('NGリスト適用後の順位が連続している', async () => {
    // 10件のデータを用意（5番目と8番目がNGになる）
    const extendedData = Array.from({ length: 10 }, (_, i) => ({
      id: `sm${(i + 1).toString().padStart(8, '0')}`,
      rank: i + 1,
      title: i === 4 ? 'NG動画' : `テスト動画${i + 1}`,
      authorId: `author${i + 1}`,
      authorName: i === 7 ? 'NG投稿者' : `投稿者${i + 1}`,
      thumbURL: `https://example.com/thumb${i + 1}.jpg`,
      views: 1000 - (i * 100),
      comments: 100 - (i * 10),
      mylists: 10 - i,
      likes: 50 - (i * 5),
      length: 300 + (i * 100),
      registeredAt: `2025-01-01T${i.toString().padStart(2, '0')}:00:00.000Z`
    }))

    render(
      <ClientPage 
        initialData={{ items: extendedData }} 
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 初期状態：10件すべて表示される
    expect(screen.getByText('テスト動画1')).toBeInTheDocument()
    expect(screen.getByText('NG動画')).toBeInTheDocument()
    expect(screen.getByText('テスト動画8')).toBeInTheDocument()
    expect(screen.getByText('テスト動画10')).toBeInTheDocument()

    // NGリストを設定（5番目のタイトルと8番目の投稿者名でフィルタ）
    const ngListData = {
      videoIds: [],
      videoTitles: {
        exact: ['NG動画'],
        partial: [],
      },
      authorIds: [],
      authorNames: {
        exact: ['NG投稿者'],
        partial: [],
      },
      version: 1,
      totalCount: 2,
      updatedAt: new Date().toISOString(),
    }

    // localStorageに保存してイベントを発火
    act(() => {
      localStorage.setItem('user-ng-list', JSON.stringify(ngListData))
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { ngList: ngListData } 
      }))
    })

    // NGリストが適用され、順位が連続していることを確認
    await waitFor(() => {
      // NGアイテムが非表示になる
      expect(screen.queryByText('NG動画')).not.toBeInTheDocument()
      expect(screen.queryByText('NG投稿者')).not.toBeInTheDocument()
      
      // 残りのアイテムが表示される（8件）
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.getByText('テスト動画2')).toBeInTheDocument()
      expect(screen.getByText('テスト動画3')).toBeInTheDocument()
      expect(screen.getByText('テスト動画4')).toBeInTheDocument()
      expect(screen.getByText('テスト動画6')).toBeInTheDocument()
      expect(screen.getByText('テスト動画7')).toBeInTheDocument()
      expect(screen.getByText('テスト動画9')).toBeInTheDocument()
      expect(screen.getByText('テスト動画10')).toBeInTheDocument()
      
      // 順位が1から8まで連続していることを確認
      // ランキングアイテムの順位要素を取得
      const rankingItems = screen.getAllByTestId('ranking-item')
      expect(rankingItems).toHaveLength(8) // 2件がフィルタされて8件表示
      
      // 各アイテムの順位を確認
      rankingItems.forEach((item, index) => {
        // 順位要素を探す（デスクトップまたはモバイル用）
        const rankElement = item.querySelector('.ranking-item-responsive__rank')
        expect(rankElement).toBeTruthy()
        expect(rankElement?.textContent).toBe((index + 1).toString())
      })
    })
  })

  test('NGリスト変更が他のタブでも即座に反映される', async () => {
    // ClientPageをレンダリング
    render(
      <ClientPage 
        initialData={{ items: mockRankingData }} 
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 初期状態を確認
    expect(screen.getByText('NGワード含む動画')).toBeInTheDocument()
    expect(screen.getByText('NG投稿者')).toBeInTheDocument()

    // 他のタブでのNGリスト更新をシミュレート
    const ngListData = {
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: ['NGワード'],
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: [],
      },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString(),
    }

    // StorageEventを使用して他のタブからの更新をシミュレート
    act(() => {
      // まずlocalStorageを更新
      localStorage.setItem('user-ng-list', JSON.stringify(ngListData))
      
      // StorageEventを発火（他のタブからの更新を模擬）
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'user-ng-list',
        newValue: JSON.stringify(ngListData),
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href
      }))
    })

    // 即座に反映されることを確認
    await waitFor(() => {
      expect(screen.queryByText('NGワード含む動画')).not.toBeInTheDocument()
      // NG投稿者の投稿者名フィルタは含まれていないので表示される
      expect(screen.getByText('NG投稿者')).toBeInTheDocument()
    }, { timeout: 1000 })
    
    // 他の動画は表示される
    expect(screen.getByText('テスト動画1')).toBeInTheDocument()
    expect(screen.getByText('テスト動画4')).toBeInTheDocument()
  })
})