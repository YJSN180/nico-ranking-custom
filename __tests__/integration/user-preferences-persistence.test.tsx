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

    // ジャンルセレクターをクリック
    const genreSelector = screen.getByRole('combobox', { name: /ジャンル/i })
    await user.selectOptions(genreSelector, 'game')

    // localStorageに保存されたことを確認
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'user-preferences',
      expect.stringContaining('"lastGenre":"game"')
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
      'user-preferences',
      expect.stringContaining('"lastPeriod":"hour"')
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
      'user-preferences',
      expect.stringContaining('"lastTag":"ゲーム実況"')
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
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedPreferences))

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
    const genreSelector = screen.getByRole('combobox', { name: /ジャンル/i })
    expect(genreSelector).toHaveValue('anime')
    
    // 期間ボタンの状態を確認（実装により異なる可能性あり）
    const periodButtons = screen.getAllByRole('button')
    const hourButton = periodButtons.find(btn => btn.textContent === '毎時')
    expect(hourButton?.getAttribute('data-active')).toBeTruthy()
  })
})