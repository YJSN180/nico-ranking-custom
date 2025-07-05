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

// Only define localStorage if it doesn't exist or can be redefined
if (!window.localStorage || Object.getOwnPropertyDescriptor(window, 'localStorage')?.configurable !== false) {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
} else {
  // If can't redefine, replace the methods directly
  Object.assign(window.localStorage, localStorageMock)
}

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
    
    // ジャンルボタンを取得（ロールではなくテキストで検索）
    const genreButtons = screen.getAllByText(/ゲーム/)
    const gameButton = genreButtons.find(button => button.tagName === 'BUTTON')
    expect(gameButton).toBeTruthy()
    
    // ゲームを選択
    await user.click(gameButton!)

    // Cookieに保存されたことを確認
    expect(cookieMock.set).toHaveBeenCalled()
    const setCookieCall = cookieMock.set.mock.calls[0][0]
    expect(setCookieCall).toContain('user-preferences=')
    expect(decodeURIComponent(setCookieCall)).toContain('"lastGenre":"game"')
  })

  it('期間変更時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    render(<ClientPage initialData={[]} />)
    
    // 期間ボタンを取得（テキストで検索）
    const hourlyButtons = screen.getAllByText(/毎時/)
    const hourlyButton = hourlyButtons.find(button => button.tagName === 'BUTTON')
    expect(hourlyButton).toBeTruthy()
    
    // 毎時を選択
    await user.click(hourlyButton!)

    // Cookieに保存されたことを確認
    expect(cookieMock.set).toHaveBeenCalled()
    const lastCall = cookieMock.set.mock.calls[cookieMock.set.mock.calls.length - 1][0]
    expect(lastCall).toContain('user-preferences=')
    expect(decodeURIComponent(lastCall)).toContain('"lastPeriod":"hour"')
  })

  it.skip('タグ選択時に設定が保存される', async () => {
    // このテストはSuspenseとlazy loadingの問題のためスキップ
    // user-preferences-persistence-fixed.test.tsxで別途テストしています
  })
})