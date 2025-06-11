import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ClientPage from '@/app/client-page'

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

// fetchのモック
global.fetch = vi.fn()

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
            json: async () => ({
              items: [{ id: '1', title: 'Video 1', rank: 1, thumbURL: '', views: 100 }],
              popularTags: [] // allジャンルは人気タグなし
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
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('genre=entertainment'),
        expect.any(Object)
      )
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

  it('allジャンルでも人気タグが表示される（集計タグ）', async () => {
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
    
    // 総合（all）に切り替え
    const allOption = screen.getByText('総合')
    await user.click(allOption)

    // APIコールを待つ
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('genre=all'),
        expect.any(Object)
      )
    })

    // 人気タグが集計されて表示されることを確認
    await waitFor(() => {
      const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const tagButtons = popularTagsSection?.querySelectorAll('button')
      const tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
      expect(tagTexts).toContain('ゲーム')
      expect(tagTexts).toContain('エンターテイメント')
      expect(tagTexts).toContain('VOICEROID実況プレイ')
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
      expect(tagTexts).toContain('その他')
      expect(tagTexts).toContain('MMD')
      expect(tagTexts).toContain('MikuMikuDance')
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
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=hour'),
        expect.any(Object)
      )
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
      if (url.includes('/api/ranking')) {
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
      expect(tagTexts).toContain('エンターテイメント')
      expect(tagTexts).toContain('踊ってみた')
    })
  })
})