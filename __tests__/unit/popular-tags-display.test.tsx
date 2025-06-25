import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
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

describe('人気タグの表示問題', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    
    // デフォルトのfetchレスポンス
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/edge/ranking')) {
        const urlObj = new URL(url, 'http://localhost')
        const genre = urlObj.searchParams.get('genre') || 'all'
        
        // APIレスポンスの形式を正確に再現
        if (genre === 'all') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              items: [{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }],
              popularTags: ['ゲーム', 'エンターテイメント', 'VOICEROID実況プレイ'] // allジャンルでも集計タグを返す
            })
          })
        }
        
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }],
            popularTags: genre === 'game' ? ['ゲーム', '実況プレイ動画'] : 
                         genre === 'entertainment' ? ['エンターテイメント', '踊ってみた'] :
                         genre === 'other' ? ['その他', 'MMD'] : []
          })
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

  it('初期表示時に人気タグが表示される', () => {
    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ']}
      />
    )

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

    // 初期状態の確認
    const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
    let tagButtons = popularTagsSection?.querySelectorAll('button')
    let tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
    expect(tagTexts).toContain('ゲーム')
    expect(tagTexts).toContain('実況プレイ動画')

    // エンターテイメントに切り替え
    const genreButtons = screen.getAllByRole('button')
    const gameGenreButton = genreButtons.find(btn => 
      btn.textContent === 'ゲーム' && 
      !btn.closest('[style*="人気タグ"]') &&
      btn.style.cssText.includes('min-width: 80px')
    )
    expect(gameGenreButton).toBeTruthy()
    await user.click(gameGenreButton!)
    
    // エンタメボタンを探す
    const entertainmentOption = screen.getByText('エンタメ')
    await user.click(entertainmentOption)

    // APIコールを待つ
    await waitFor(() => {
      const fetchSpy = global.fetch as any
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) => 
        call[0] && call[0].includes('/api/edge/ranking?genre=entertainment&period=24h')
      )
      expect(rankingCall).toBeTruthy()
    })

    // 人気タグが更新されることを確認
    await waitFor(() => {
      const updatedPopularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const updatedTagButtons = updatedPopularTagsSection?.querySelectorAll('button')
      const updatedTagTexts = Array.from(updatedTagButtons || []).map(btn => btn.textContent)
      expect(updatedTagTexts).toContain('エンターテイメント')
      expect(updatedTagTexts).toContain('踊ってみた')
      // 前のタグが消えていることを確認
      expect(updatedTagTexts).not.toContain('ゲーム')
      expect(updatedTagTexts).not.toContain('実況プレイ動画')
    })
  })

  it('allジャンルでは人気タグが表示されない', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    // 初期状態の確認（ゲームジャンルでは人気タグが表示される）
    expect(screen.getByText('人気タグ')).toBeInTheDocument()

    // ゲームジャンルボタンを見つける
    const genreButtons = screen.getAllByRole('button')
    const gameGenreButton = genreButtons.find(btn => 
      btn.textContent === 'ゲーム' && 
      btn.style.cssText.includes('min-width: 80px')
    )
    await user.click(gameGenreButton!)
    
    // 総合（all）に切り替え
    const allOption = screen.getByText('総合')
    await user.click(allOption)

    // APIコールを待つ
    await waitFor(() => {
      const fetchSpy = global.fetch as any
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) => 
        call[0] && call[0].includes('/api/edge/ranking?genre=all&period=24h')
      )
      expect(rankingCall).toBeTruthy()
    })

    // 人気タグセクションが表示されないことを確認
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

  it('period切り替え時も人気タグが更新される', async () => {
    const user = userEvent.setup()

    render(
      <ClientPage
        initialData={[{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム24h', '実況プレイ24h']}
      />
    )

    // 初期状態の確認
    const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
    let tagButtons = popularTagsSection?.querySelectorAll('button')
    let tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
    expect(tagTexts).toContain('ゲーム24h')

    // 24時間ボタンをクリック
    const periodButtons = screen.getAllByRole('button')
    const periodButton = periodButtons.find(btn => 
      btn.textContent === '24時間' &&
      btn.style.cssText.includes('background: var(--primary-color)')
    )
    await user.click(periodButton!)
    
    // 毎時に切り替え
    const hourOption = screen.getByText('毎時')
    await user.click(hourOption)

    // APIコールを待つ
    await waitFor(() => {
      const fetchSpy = global.fetch as any
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) => 
        call[0] && call[0].includes('/api/edge/ranking?genre=game&period=hour')
      )
      expect(rankingCall).toBeTruthy()
    })

    // getPopularTagsで新しいタグが取得される
    await waitFor(() => {
      const updatedPopularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const updatedTagButtons = updatedPopularTagsSection?.querySelectorAll('button')
      const updatedTagTexts = Array.from(updatedTagButtons || []).map(btn => btn.textContent)
      expect(updatedTagTexts).toContain('ゲーム')
      expect(updatedTagTexts).toContain('実況プレイ動画')
    })
  })

  it('配列形式のAPIレスポンスでも人気タグが維持される', async () => {
    // 配列形式のレスポンスを返すようモック
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/edge/ranking')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 },
            { id: '2', title: 'Video 2', rank: 2, thumbURL: '', views: 200 }
          ] // 配列形式（人気タグなし）
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

    // 初期状態の確認
    expect(screen.getByText('人気タグ')).toBeInTheDocument()

    // ゲームジャンルボタンを見つける
    const genreButtons = screen.getAllByRole('button')
    const gameGenreButton = genreButtons.find(btn => 
      btn.textContent === 'ゲーム' && 
      btn.style.cssText.includes('min-width: 80px')
    )
    await user.click(gameGenreButton!)
    
    // エンタメに切り替え
    const entertainmentOption = screen.getByText('エンタメ')
    await user.click(entertainmentOption)

    // APIコールを待つ
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    // getPopularTagsで動的に取得されることを確認
    await waitFor(() => {
      const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const tagButtons = popularTagsSection?.querySelectorAll('button')
      const tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
      // タグが表示されていることを確認（順番は問わない）
      expect(tagTexts).toContain('すべて') // 「すべて」ボタンが最初に表示される
      expect(tagTexts).toContain('ゲーム') // ゲームタグが表示される（初期のpopularTagsから）
      expect(tagTexts).toContain('実況プレイ動画')
    })
  })
})