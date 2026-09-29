import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'

// PWA のとき、ClientPage は window の blur でナビゲーション状態を保存する。
// 無名のリスナーを登録し、片付けでは別の関数を外していたため、アンマウント後（ホーム・ロゴでの
// 作り直しなど）も古いインスタンスが blur のたびに状態を保存し続けていた。

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    updatePreferences: vi.fn(),
    isLoading: false
  })
}))

vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      tags: {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      },
      version: 2,
      totalCount: 0,
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    saveNGListDirectly: vi.fn()
  })
}))

vi.mock('@/lib/ranking-cache', () => ({
  rankingCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn()
  }
}))

vi.mock('@/components/tag-selector', () => ({
  TagSelector: () => null
}))

const items = Array.from({ length: 5 }, (_, i) => ({
  rank: i + 1,
  id: `sm9000050${i}`,
  title: `合成タイトル ${i + 1}`,
  thumbURL: 'https://example.com/thumb.jpg',
  views: 100 - i,
  comments: 1,
  mylists: 1,
  likes: 1,
  authorId: `9000050${i}`,
  authorName: `合成投稿者 ${i}`
}))

async function renderPage() {
  const view = render(<ClientPage initialData={{ items }} initialGenre="all" initialPeriod="24h" />)
  expect(await screen.findByText('合成タイトル 1')).toBeInTheDocument()
  return view
}

describe('ClientPage: PWA の blur での状態保存', () => {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }

  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
    Object.defineProperty(navigatorWithStandalone, 'standalone', { configurable: true, value: true })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigatorWithStandalone, 'standalone')
  })

  it('表示中は blur で状態を保存する', async () => {
    await renderPage()
    fireEvent.blur(window)
    expect(window.localStorage.getItem('ranking-navigation-state')).not.toBeNull()
  })

  it('アンマウントした後は blur で状態を保存しない', async () => {
    const { unmount } = await renderPage()
    unmount()
    window.localStorage.clear()
    fireEvent.blur(window)
    expect(window.localStorage.getItem('ranking-navigation-state')).toBeNull()
  })
})
