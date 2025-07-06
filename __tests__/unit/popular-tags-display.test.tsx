import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, beforeAll } from 'vitest'
import ClientPage from '@/app/client-page'

// Request throttle のモック
vi.mock('@/lib/request-throttle', () => ({
  requestThrottle: {
    throttle: vi.fn().mockResolvedValue(undefined)
  }
}))

// Ranking cache のモック
vi.mock('@/lib/ranking-cache', () => ({
  rankingCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn()
  }
}))

// Next.js のモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

// TagSelectorを通常のimportに戻すためのモック
vi.mock('@/components/tag-selector', () => ({
  TagSelector: ({ config, onConfigChange, popularTags = [] }: any) => {
    // タグが選択されている場合は非表示
    if (config.tag) return null
    
    // allジャンルの場合は何も表示しない（実際のコンポーネントと同じ挙動）
    if (config.genre === 'all') return null
    
    // その他のジャンルではタグを表示
    return (
      <div className="_selectorContainer_933bb3">
        <div>
          <h2 className="_selectorTitle_933bb3">人気タグ</h2>
          <div className="_buttonContainer_933bb3">
            <button className="_button_933bb3 _buttonSelected_933bb3">すべて</button>
            {popularTags.map((tag: string) => (
              <button key={tag} className="_button_933bb3">{tag}</button>
            ))}
          </div>
        </div>
      </div>
    )
  }
}))

// popular-tags モジュールのモック
vi.mock('@/lib/popular-tags', () => ({
  getPopularTags: vi.fn().mockImplementation(async (genre) => {
    if (genre === 'all') return ['ゲーム', 'エンターテイメント', 'VOICEROID実況プレイ'] // すべてジャンルの集計タグ
    if (genre === 'game') return ['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ']
    if (genre === 'entertainment') return ['エンターテイメント', '踊ってみた', '歌ってみた']
    if (genre === 'other') return ['その他', 'MMD', 'MikuMikuDance']
    return []
  })
}))

// popular-tags-clientのモック
vi.mock('@/lib/popular-tags-client', () => ({
  getPopularTagsClient: vi.fn(async (genre: string) => {
    if (genre === 'game') return ['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ']
    if (genre === 'entertainment') return ['エンターテイメント', '踊ってみた', '歌ってみた']
    if (genre === 'other') return ['その他', 'MMD', 'MikuMikuDance']
    return []
  })
}))

// useRealtimeStatsのモック
vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null,
    hasRealtimeData: false
  })
}))

// useVideoTagsのモック
vi.mock('@/hooks/use-video-tags', () => ({
  useVideoTags: (data: any[]) => ({
    items: data,
    isLoading: false
  })
}))

// 他のフックのモック
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    updatePreferences: vi.fn(),
    isLoading: false
  })
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: []
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: []
      },
      version: 1,
      totalCount: 0,
      updatedAt: new Date().toISOString()
    },
    addToNGList: vi.fn(),
    removeFromNGList: vi.fn(),
    filterItems: (items: any[]) => items,
    isLoading: false
  })
}))

// fetchのモック
global.fetch = vi.fn()

// MylistOperationsProvider テスト環境セットアップ
beforeAll(() => {
  // @ts-ignore
  global.window = global.window || {}
  // @ts-ignore
  window.__TEST_ENV__ = true
  // @ts-ignore
  window.__MOCK_MYLIST_DATA__ = {
    mylists: []
  }
})

// test-utils.tsxのrenderがMylistOperationsProviderを含む

describe('人気タグの表示問題', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    
    // デフォルトのfetchレスポンス
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/ranking')) {
        const urlObj = new URL(url, 'http://localhost')
        const genre = urlObj.searchParams.get('genre') || 'all'
        
        // APIレスポンスの形式を正確に再現
        if (genre === 'all') {
          return Promise.resolve({
            ok: true,
            headers: {
              get: (key: string) => key === 'content-encoding' ? 'gzip' : null
            },
            json: async () => ({
              items: [{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }],
              popularTags: ['ゲーム', 'エンターテイメント', 'VOICEROID実況プレイ'] // allジャンルでも集計タグを返す
            }),
            clone: function() { return this }
          })
        }
        
        return Promise.resolve({
          ok: true,
          headers: {
            get: (key: string) => key === 'content-encoding' ? 'gzip' : null
          },
          json: async () => ({
            items: [{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }],
            popularTags: genre === 'game' ? ['ゲーム', '実況プレイ動画'] : 
                         genre === 'entertainment' ? ['エンターテイメント', '踊ってみた'] :
                         genre === 'other' ? ['その他', 'MMD'] : []
          }),
          clone: function() { return this }
        })
      }
      // video-stats APIの場合は空のレスポンスを返す
      if (url.includes('/api/edge/video-stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stats: {},
            timestamp: new Date().toISOString(),
            count: 0
          })
        })
      }
      // video-tags APIの場合は空のレスポンスを返す
      if (url.includes('/api/edge/video-tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        })
      }
      return Promise.reject(new Error('Not found'))
    })
  })

  it('初期表示時に人気タグが表示される', async () => {
    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ']}
      />
    )

    // TagSelectorが動的インポートされるため、表示を待つ
    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    // 人気タグセクションを探す
    const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
    expect(popularTagsSection).toBeInTheDocument()
    
    // タグボタンを探す（ジャンルボタンと区別するため、親要素を確認）
    const tagButtons = popularTagsSection?.querySelectorAll('button')
    const tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
    
    // 人気タグが表示されることを確認
    expect(tagTexts).toContain('ゲーム')
    expect(tagTexts).toContain('実況プレイ動画')
    expect(tagTexts).toContain('VOICEROID実況プレイ')
  })

  it('ジャンル切り替え時に人気タグが更新される', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    // TagSelectorが動的インポートされるため、表示を待つ
    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    // 初期状態の確認（すべてボタンが最初に表示される）
    const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
    let tagButtons = popularTagsSection?.querySelectorAll('button')
    let tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
    expect(tagTexts).toContain('すべて')  // すべてボタンが最初
    expect(tagTexts).toContain('ゲーム')
    expect(tagTexts).toContain('実況プレイ動画')

    // エンターテイメントに切り替え
    const entertainmentButton = screen.getByText('エンタメ')
    await user.click(entertainmentButton)

    // APIコールを待つ（URLがqueryパラメータの順序によって異なる可能性がある）
    await waitFor(() => {
      const fetchSpy = global.fetch as any
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) => 
        call[0] && call[0].includes('/api/ranking') && 
        call[0].includes('genre=entertainment') &&
        call[0].includes('period=24h')
      )
      expect(rankingCall).toBeTruthy()
    })

    // 人気タグが更新されることを確認
    await waitFor(() => {
      const updatedPopularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const updatedTagButtons = updatedPopularTagsSection?.querySelectorAll('button')
      const updatedTagTexts = Array.from(updatedTagButtons || []).map(btn => btn.textContent)
      expect(updatedTagTexts).toContain('すべて')  // すべてボタンは常に存在
      expect(updatedTagTexts).toContain('エンターテイメント')
      expect(updatedTagTexts).toContain('踊ってみた')
      // 前のゲームタグが消えていることを確認（ただし、「ゲーム」はタグとして残る可能性あり）
      expect(updatedTagTexts).not.toContain('実況プレイ動画')
    })
  })

  it('allジャンルでは人気タグセクションが非表示になる', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    // TagSelectorが動的インポートされるため、表示を待つ
    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    // 初期状態の確認（ゲームジャンルでは人気タグが表示される）
    const initialTagSection = screen.getByText('人気タグ').closest('div')?.parentElement
    const initialTagButtons = initialTagSection?.querySelectorAll('button')
    expect(initialTagButtons?.length).toBeGreaterThan(1) // すべてボタン + タグ

    // 総合（all）に切り替え
    const allButton = screen.getByText('総合')
    await user.click(allButton)

    // APIコールを待つ（URLがqueryパラメータの順序によって異なる可能性がある）
    await waitFor(() => {
      const fetchSpy = global.fetch as any
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) => 
        call[0] && call[0].includes('/api/ranking') && 
        call[0].includes('genre=all') &&
        call[0].includes('period=24h')
      )
      expect(rankingCall).toBeTruthy()
    })

    // 総合ジャンルでは人気タグセクションが非表示になることを確認
    await waitFor(() => {
      expect(screen.queryByText('人気タグ')).not.toBeInTheDocument()
    })
  })

  it('初期表示でpopularTagsが空の場合、動的に取得される', async () => {
    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="other"
        initialPeriod="24h"
        popularTags={[]} // 空の人気タグ
      />
    )

    // getPopularTagsが呼ばれて動的に取得されることを確認
    await waitFor(() => {
      const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const tagButtons = popularTagsSection?.querySelectorAll('button')
      const tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
      // タグが全体的に表示されていることを確認（順番は問わない）
      expect(tagTexts).toContain('すべて') // 「すべて」ボタンが最初に表示される
      expect(tagTexts.length).toBeGreaterThan(1) // 他のタグも取得されている
      // getPopularTagsモックで「その他」ジャンルの場合は ['その他', 'MMD', 'MikuMikuDance'] を返すはず
      expect(tagTexts).toEqual(expect.arrayContaining(['すべて', 'その他', 'MMD', 'MikuMikuDance']))
    })
  })

  it('period切り替え時にAPIが再度呼び出される', async () => {
    const user = userEvent.setup()
    const fetchSpy = global.fetch as any

    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    // TagSelectorが動的インポートされるため、表示を待つ
    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    // 初期状態の確認
    const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
    const tagButtons = popularTagsSection?.querySelectorAll('button')
    expect(tagButtons).toBeTruthy()
    expect(tagButtons?.length).toBeGreaterThan(1) // すべてボタン + タグ

    // fetchをクリア
    fetchSpy.mockClear()

    // 毎時に切り替え
    const hourButton = screen.getByText('毎時')
    await user.click(hourButton)

    // 期間変更時に新しいAPIリクエストが行われることを確認
    await waitFor(() => {
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) => 
        call[0] && call[0].includes('/api/ranking') && 
        call[0].includes('genre=game') &&
        call[0].includes('period=hour')
      )
      expect(rankingCall).toBeTruthy()
    })

    // getPopularTagsClientも呼ばれることを確認
    const { getPopularTagsClient } = await import('@/lib/popular-tags-client')
    await waitFor(() => {
      // 第1引数がgenre、第2引数がperiod、第3引数がAbortSignalの可能性がある
      expect(getPopularTagsClient).toHaveBeenCalled()
      const calls = (getPopularTagsClient as any).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      expect(calls[calls.length - 1][0]).toBe('game') // genre
    })
  })

  it('配列形式のAPIレスポンスでも人気タグセクションが表示される', async () => {
    // 配列形式のレスポンスを返すようモック
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/ranking')) {
        return Promise.resolve({
          ok: true,
          headers: {
            get: (key: string) => key === 'content-encoding' ? 'gzip' : null
          },
          json: async () => [
            { id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 },
            { id: '2', title: 'Video 2', rank: 2, thumbURL: '', views: 200 }
          ], // 配列形式（人気タグなし）
          clone: function() { return this }
        })
      }
      // video-stats APIの場合は空のレスポンスを返す
      if (url.includes('/api/edge/video-stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stats: {},
            timestamp: new Date().toISOString(),
            count: 0
          })
        })
      }
      // video-tags APIの場合は空のレスポンスを返す
      if (url.includes('/api/edge/video-tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        })
      }
      return Promise.reject(new Error('Not found'))
    })

    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    // TagSelectorが動的インポートされるため、表示を待つ
    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    // 初期状態の確認 - 人気タグセクションが表示されている
    const initialTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
    const initialTagButtons = initialTagsSection?.querySelectorAll('button')
    expect(initialTagButtons).toBeTruthy()
    expect(initialTagButtons?.length).toBeGreaterThan(0)

    // エンタメに切り替え
    const entertainmentButton = screen.getByText('エンタメ')
    await user.click(entertainmentButton)

    // APIコールを待つ
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    // ジャンル切り替え後も人気タグセクションが表示され続けることを確認
    await waitFor(() => {
      const updatedTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const updatedTagButtons = updatedTagsSection?.querySelectorAll('button')
      expect(updatedTagButtons).toBeTruthy()
      expect(updatedTagButtons?.length).toBeGreaterThan(0) // 少なくとも「すべて」ボタンは存在
    })
  })
})