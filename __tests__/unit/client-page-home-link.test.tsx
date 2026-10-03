import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'

// H6 の修正で、ホーム・ロゴでの遷移時に ClientPage は key で作り直される。
// 作り直しのマウント時に、以前（動画を開いたとき等）保存したナビゲーション状態が
// 残っていると、ホームへ移動したのにその状態へ上書き復元されてしまう。
// ホーム（/）へのリンクは明示的なトップへの移動なので、保存済みの状態を消す。

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
      updatedAt: new Date().toISOString()
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

const items = Array.from({ length: 20 }, (_, i) => ({
  rank: i + 1,
  id: `sm${i + 1}`,
  title: `合成タイトル ${i + 1}`,
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1000 - i,
  comments: 10,
  mylists: 5,
  likes: 3,
  tags: ['合成タグ'],
  authorId: `9000${i}`,
  authorName: `合成投稿者 ${i}`
}))

describe('ClientPage: ホームへのリンクと保存済みナビゲーション状態', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?genre=vocaloid')
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('ホーム（/）へのリンクを押すと、保存済みの状態を消す（作り直し後に上書き復元しない）', async () => {
    const savedAt = Date.now()
    window.localStorage.setItem(
      'ranking-navigation-state',
      JSON.stringify({ genre: 'vocaloid', period: '24h', page: 2, popularTags: [], scrollPosition: 1200, savedAt })
    )
    window.sessionStorage.setItem(
      'navigation-state',
      JSON.stringify({ pathname: '/', searchParams: '', scrollPosition: 1200, timestamp: savedAt })
    )

    render(<ClientPage initialData={{ items }} initialGenre="vocaloid" initialPeriod="24h" />)
    expect(await screen.findByText('合成タイトル 1')).toBeInTheDocument()

    const homeLink = document.createElement('a')
    homeLink.href = '/'
    homeLink.textContent = 'ホーム'
    // jsdom の遷移（未実装）を避ける。ClientPage の document のクリック監視は preventDefault に関係なく動く
    homeLink.addEventListener('click', (event) => event.preventDefault())
    document.body.appendChild(homeLink)
    fireEvent.click(homeLink)

    expect(window.localStorage.getItem('ranking-navigation-state')).toBeNull()
    expect(window.sessionStorage.getItem('navigation-state')).toBeNull()
  })

  it('ホーム以外の内部リンクでは、これまでどおり状態を保存する', async () => {
    render(<ClientPage initialData={{ items }} initialGenre="vocaloid" initialPeriod="24h" />)
    expect(await screen.findByText('合成タイトル 1')).toBeInTheDocument()

    const mylistLink = document.createElement('a')
    mylistLink.href = '/mylists'
    mylistLink.textContent = 'マイリスト'
    mylistLink.addEventListener('click', (event) => event.preventDefault())
    document.body.appendChild(mylistLink)
    fireEvent.click(mylistLink)

    const saved = JSON.parse(window.localStorage.getItem('ranking-navigation-state') ?? 'null')
    expect(saved?.genre).toBe('vocaloid')
  })
})
