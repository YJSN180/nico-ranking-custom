import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClientPage from '@/app/client-page'

// Next.js navigation モック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => null,
  }),
}))

// localStorageのモック
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Next.js fetch のモック
global.fetch = vi.fn()

describe('ユーザー設定の永続化', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], popularTags: [] }),
    } as Response)
    
    // localStorageのデフォルト返却値を設定
    localStorageMock.getItem.mockImplementation((key: string) => {
      // NGリストのデフォルト値を返す
      if (key === 'user-ng-list') {
        return JSON.stringify({
          videoIds: [],
          videoTitles: { exact: [], partial: [] },
          authorIds: [],
          authorNames: { exact: [], partial: [] },
          version: 1,
          totalCount: 0,
          updatedAt: new Date().toISOString()
        })
      }
      return null
    })
  })

  it('ジャンル変更時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    render(
      <ClientPage
        initialData={[]}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // ジャンルボタンをクリック
    const gameButton = screen.getByRole('button', { name: 'ゲーム' })
    await user.click(gameButton)

    // localStorageに保存されたことを確認
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'ranking-config',
      expect.stringContaining('"genre":"game"')
    )
  })

  it('期間変更時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    render(
      <ClientPage
        initialData={[]}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 期間セレクターをクリック
    const periodButtons = screen.getAllByRole('button')
    const hourButton = periodButtons.find(btn => btn.textContent === '毎時')
    
    if (hourButton) {
      await user.click(hourButton)
    }

    // localStorageに保存されたことを確認
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'ranking-config',
      expect.stringContaining('"period":"hour"')
    )
  })

  it('タグ選択時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    render(
      <ClientPage
        initialData={[]}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['ゲーム実況', 'RTA', '縛りプレイ']}
      />
    )

    // タグボタンをクリック
    const tagButton = screen.getByText('ゲーム実況')
    await user.click(tagButton)

    // localStorageに保存されたことを確認
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'ranking-config',
      expect.stringContaining('"tag":"ゲーム実況"')
    )
  })

  it('ページ読み込み時に保存された設定が適用される', () => {
    // 保存された設定
    const savedPreferences = {
      lastGenre: 'anime',
      lastPeriod: 'hour',
      lastTag: 'アニメ',
      version: 1,
      updatedAt: new Date().toISOString(),
    }
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'user-preferences') {
        return JSON.stringify(savedPreferences)
      }
      // NGリストのデフォルト値を返す
      if (key === 'user-ng-list') {
        return JSON.stringify({
          videoIds: [],
          videoTitles: { exact: [], partial: [] },
          authorIds: [],
          authorNames: { exact: [], partial: [] },
          version: 1,
          totalCount: 0,
          updatedAt: new Date().toISOString()
        })
      }
      return null
    })

    // app/page.tsxが設定を読み込んでClientPageに渡すことをシミュレート
    render(
      <ClientPage
        initialData={[]}
        initialGenre="anime" // 保存された設定
        initialPeriod="hour"  // 保存された設定
        initialTag="アニメ"   // 保存された設定
        popularTags={['アニメ', '2024年冬アニメ']}
      />
    )

    // UIに反映されていることを確認
    // ジャンルセクション内のアニメボタンが選択状態になっているか確認
    const genreSection = screen.getByText('ジャンル').parentElement
    const animeButtons = genreSection?.querySelectorAll('button')
    const animeButton = Array.from(animeButtons || []).find(btn => btn.textContent === 'アニメ')
    // CSS変数を使用しているため、style属性を直接確認
    expect(animeButton?.getAttribute('style')).toContain('background: var(--primary-color)')
    expect(animeButton?.getAttribute('style')).toContain('border-color: var(--primary-color)')
    
    // 毎時ボタンが選択状態になっているか確認
    const hourButton = screen.getByRole('button', { name: '毎時' })
    expect(hourButton.getAttribute('style')).toContain('background: var(--primary-color)')
    expect(hourButton.getAttribute('style')).toContain('border-color: var(--primary-color)')
  })
})