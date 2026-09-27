import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'

// ニコニコ動画へのリンクを押すと、ClientPage は「移動中」として全行を無効（薄く・押せない）にし、
// ページが隠れる（visibilitychange）かフォーカスが戻るまで解除しない。
// - Cmd / Ctrl で押して裏のタブで開いた、または新しいタブ（target=_blank）で開いたときは
//   このページは移動しない。裏のタブだとページは見えたまま・フォーカスもそのままなので、
//   解除されず、次に押した動画も開けなくなっていた（本番ビルドの PC 幅で再現）。

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

// 本番（App Router）は React の根が document なので、行のリンクの stopPropagation に関係なく
// document のクリック監視が動く。テストでは同じ監視を、行の外に置いたリンクで確かめる
function clickLink(href: string, { target, ...init }: { target?: string } & MouseEventInit = {}) {
  const link = document.createElement('a')
  link.href = href
  if (target) link.target = target
  link.textContent = 'リンク'
  // jsdom の遷移（未実装）を避ける
  link.addEventListener('click', (event) => event.preventDefault())
  document.body.appendChild(link)
  fireEvent.click(link, init)
  link.remove()
}

function rowsDisabled(): boolean {
  const rows = screen.getAllByTestId('ranking-item')
  return rows.every((row) => row.style.opacity === '0.6')
}

async function renderPage() {
  const view = render(<ClientPage initialData={{ items }} initialGenre="all" initialPeriod="24h" />)
  expect(await screen.findByText('合成タイトル 1')).toBeInTheDocument()
  expect(rowsDisabled()).toBe(false)
  return view
}

describe('ClientPage: ニコニコ動画へのリンクを押したときの行の無効化', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
  })

  it('Cmd / Ctrl で押して裏のタブで開いたときは、行を無効にしない', async () => {
    await renderPage()
    clickLink('https://www.nicovideo.jp/watch/sm90000500', { target: '_blank', metaKey: true })
    expect(rowsDisabled()).toBe(false)
    clickLink('https://www.nicovideo.jp/user/90000500', { ctrlKey: true })
    expect(rowsDisabled()).toBe(false)
  })

  it('新しいタブ（target=_blank）で開くリンクでは、行を無効にしない', async () => {
    await renderPage()
    clickLink('https://www.nicovideo.jp/watch/sm90000500', { target: '_blank' })
    expect(rowsDisabled()).toBe(false)
  })

  it('このページが移動するリンク（同じタブ）では、従来どおり行を無効にする', async () => {
    await renderPage()
    clickLink('https://www.nicovideo.jp/user/90000500')
    expect(rowsDisabled()).toBe(true)
  })

  it('どの開き方でも、戻ったときのために状態を保存する（従来どおり）', async () => {
    await renderPage()
    clickLink('https://www.nicovideo.jp/watch/sm90000500', { target: '_blank', metaKey: true })
    expect(window.localStorage.getItem('ranking-navigation-state')).not.toBeNull()
  })
})
