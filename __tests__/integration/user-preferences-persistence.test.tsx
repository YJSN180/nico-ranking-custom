import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
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

// document.cookieのモック
const cookieMock = {
  get: vi.fn(() => ''),
  set: vi.fn((value: string) => {
    cookieMock._value = value
  }),
  _value: '',
}

Object.defineProperty(document, 'cookie', {
  get: () => cookieMock._value,
  set: (value: string) => {
    cookieMock.set(value)
    cookieMock._value = value
  },
  configurable: true,
})

// Next.js fetch のモック
global.fetch = vi.fn()

describe('ユーザー設定の永続化', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieMock._value = ''
    cookieMock.set.mockClear()
    
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
    
    render(<ClientPage initialData={[]} />)
    
    // ジャンル選択を開く
    const genreButton = screen.getByRole('button', { name: /総合/ })
    await user.click(genreButton)
    
    // ゲームを選択
    const gameButton = screen.getByRole('button', { name: /ゲーム/ })
    await user.click(gameButton)

    // Cookieに保存されたことを確認
    expect(cookieMock.set).toHaveBeenCalled()
    const setCookieCall = cookieMock.set.mock.calls[0][0]
    expect(setCookieCall).toContain('user-preferences=')
    expect(decodeURIComponent(setCookieCall)).toContain('"lastGenre":"game"')
  })

  it('期間変更時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    render(<ClientPage initialData={[]} />)
    
    // 期間選択を開く（24時間がデフォルト）
    const periodButton = screen.getByRole('button', { name: /24時間/ })
    await user.click(periodButton)
    
    // 毎時を選択
    const hourlyButton = screen.getByRole('button', { name: /毎時/ })
    await user.click(hourlyButton)

    // Cookieに保存されたことを確認
    expect(cookieMock.set).toHaveBeenCalled()
    const lastCall = cookieMock.set.mock.calls[cookieMock.set.mock.calls.length - 1][0]
    expect(lastCall).toContain('user-preferences=')
    expect(decodeURIComponent(lastCall)).toContain('"lastPeriod":"hour"')
  })

  it('タグ選択時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    render(<ClientPage 
      initialData={[]} 
      initialGenre="game"
      popularTags={['ゲーム実況', 'RTA', 'TAS']}
    />)
    
    // タグボタンを選択
    const tagButton = screen.getByRole('button', { name: /ゲーム実況/ })
    await user.click(tagButton)

    // Cookieに保存されたことを確認
    expect(cookieMock.set).toHaveBeenCalled()
    const lastCall = cookieMock.set.mock.calls[cookieMock.set.mock.calls.length - 1][0]
    expect(lastCall).toContain('user-preferences=')
    expect(decodeURIComponent(lastCall)).toContain('"lastTag":"ゲーム実況"')
  })
})