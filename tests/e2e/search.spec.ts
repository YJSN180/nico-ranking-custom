// 検索ページの E2E。ブラウザから出る /api/** と画像・Sentry への通信はすべてここで応答し、
// ニコニコの上流やサイトのサーバー API は呼ばない（本番ビルドでも検索 API は閉じているため、画面だけを確かめる）。
// 動画 ID・ユーザー ID・名前はすべて合成値。
import { test, expect, type Page } from '@playwright/test'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)
const TAGS = [
  '初音ミク',
  'ミクオリジナル曲',
  '初音ミク名曲リンク',
  'ミクダヨー',
  'VOCALOID',
  '歌ってみた',
  '演奏してみた',
  'ミク1',
  'ミク2',
  'ミク3',
  'ミク4',
]
const USERS = [
  {
    id: '1001',
    name: 'e2e-creator-a',
    followerCount: 12000,
    videoCount: 34,
    description: '説明 a',
  },
  {
    id: '1002',
    name: 'e2e-creator-b',
    followerCount: 800,
    videoCount: 120,
    description: '',
  },
]

const video = (id: string, title: string) => ({
  rank: 1,
  id,
  title,
  thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${id}`,
  views: 1200,
  comments: 34,
  mylists: 5,
  likes: 6,
  duration: 200,
  registeredAt: '2026-09-01T00:00:00+09:00',
  authorId: '1001',
  authorName: 'e2e-creator-a',
  tags: ['e2e'],
  tagDetails: [{ name: 'e2e', isLocked: false }],
})

interface ApiCall {
  path: string
  params: URLSearchParams
}

async function mockNetwork(
  page: Page,
): Promise<{ calls: ApiCall[]; unmocked: string[] }> {
  const calls: ApiCall[] = []
  const unmocked: string[] = []
  await page.route(/sentry\.io|_vercel\/(insights|speed-insights)/, (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route(/\/_next\/image|nimg\.jp|nicovideo\.cdn/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  )
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    calls.push({ path: url.pathname, params: url.searchParams })
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    switch (url.pathname) {
      case '/api/tags/autocomplete': {
        const q = url.searchParams.get('q') ?? ''
        return json({
          suggestions: TAGS.filter((tag) => tag.includes(q)).slice(0, 10),
        })
      }
      case '/api/search':
        return json({
          items: [video('sm1', `「${url.searchParams.get('q') ?? ''}」の結果`)],
          totalCount: 1,
          page: 1,
          source: 'snapshot',
        })
      case '/api/search/videos': {
        const ids = (url.searchParams.get('ids') ?? '').split(',')
        return json({
          items: ids
            .filter((id) => id !== 'sm404')
            .map((id) => video(id, `動画 ${id} の題名`)),
          hiddenIds: [],
          missing: ids.filter((id) => id === 'sm404'),
          unavailable: [],
          failed: [],
        })
      }
      case '/api/search/users':
        return json({
          items: USERS,
          totalCount: 120,
          page: Number(url.searchParams.get('page') ?? '1'),
          pageSize: 50,
        })
      case '/api/search/owners':
        return json({
          users: {},
          channels: {},
          missing: [],
          hiddenAuthorIds: [],
        })
      case '/api/search/realtime-tags':
        return json({ tagDetails: {}, hiddenIds: [] })
      default:
        unmocked.push(url.pathname)
        return json({ error: 'not_mocked' }, 404)
    }
  })
  return { calls, unmocked }
}

/** 検索ページを開き、ハイドレーションが済むまで待つ（済む前の打鍵は取りこぼされる） */
async function openSearch(page: Page, query = ''): Promise<void> {
  await page.goto(`/search${query ? `?${query}` : ''}`)
  await page.waitForFunction(() => {
    const input = document.getElementById('search-keyword-input')
    return (
      !!input &&
      Object.keys(input).some((key) => key.startsWith('__reactProps$'))
    )
  })
}

const field = (page: Page) => page.locator('#search-keyword-input')
/** 検索欄の候補の一覧（並び順などの <select> の選択肢は数えない） */
const candidates = (page: Page) => page.getByRole('listbox')
const callsTo = (calls: ApiCall[], path: string) =>
  calls.filter((call) => call.path === path)

test.describe('検索ページ', () => {
  test('動画ID・URL を入れると「動画を表示」を出し、入力した順に開いて、見つからない理由を示す', async ({
    page,
  }) => {
    const { calls, unmocked } = await mockNetwork(page)
    await openSearch(page)
    await field(page).click()
    await field(page).fill('https://www.nicovideo.jp/watch/sm9 sm404')
    await expect(
      candidates(page).getByRole('option', { name: '動画 sm9 ほか1件を表示' }),
    ).toBeVisible()
    // ID の入力ではタグ候補を取りに行かない
    expect(callsTo(calls, '/api/tags/autocomplete')).toHaveLength(0)

    await field(page).press('Enter')
    await expect(page).toHaveURL(/[?&]type=id&q=sm9\+sm404$/)
    await expect(field(page)).toHaveValue('sm9 sm404')
    await expect(page.getByText('動画 sm9 の題名')).toBeVisible()
    await expect(page.getByText(/sm404 は見つかりませんでした/)).toBeVisible()
    expect(
      callsTo(calls, '/api/search/videos').map((call) =>
        call.params.get('ids'),
      ),
    ).toEqual(['sm9,sm404'])
    // 開いた後に候補が開き直さない。動画の検索だけの操作は隠す
    await expect(candidates(page).getByRole('option')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: '詳細条件', exact: true }),
    ).toBeHidden()
    expect(unmocked).toEqual([])
  })

  test('語の候補の最後に「ユーザーを探す」を出し、ユーザーの結果・並び順・［動画］への切り替えができる', async ({
    page,
  }) => {
    const { calls, unmocked } = await mockNetwork(page)
    await openSearch(page)
    await field(page).click()
    await field(page).fill('ミク')
    const action = candidates(page).getByRole('option', {
      name: '「ミク」でユーザーを探す',
    })
    await expect(action).toBeVisible()
    const options = await candidates(page).getByRole('option').allTextContents()
    expect(options.length).toBeGreaterThan(1)
    expect(options.at(-1)).toBe('「ミク」でユーザーを探す')
    // 候補が多くても操作の行は一覧の下に固定され、スクロールせずに見える
    const listBox = await page.getByRole('listbox').boundingBox()
    const actionBox = await action.boundingBox()
    expect(
      listBox &&
        actionBox &&
        actionBox.y + actionBox.height <= listBox.y + listBox.height + 1,
    ).toBe(true)

    await action.click()
    await expect(page).toHaveURL(/[?&]type=user&q=%E3%83%9F%E3%82%AF$/)
    const firstUser = page.getByRole('link', {
      name: 'e2e-creator-a',
      exact: true,
    })
    await expect(firstUser).toHaveAttribute(
      'href',
      'https://www.nicovideo.jp/user/1001',
    )
    await expect(page.getByText(/全120件中/).first()).toBeVisible()
    await expect(candidates(page).getByRole('option')).toHaveCount(0)

    await page.getByLabel('ユーザーの並び順').selectOption('videos')
    await expect(page).toHaveURL(/usort=videos/)
    await expect
      .poll(() =>
        callsTo(calls, '/api/search/users').at(-1)?.params.get('sort'),
      )
      .toBe('videos')
    // 並び順を変えても、検索欄の候補は開き直さない
    await expect(candidates(page).getByRole('option')).toHaveCount(0)

    await page
      .getByRole('radiogroup', { name: '結果の種類' })
      .getByText('動画', { exact: true })
      .click()
    await expect(page).not.toHaveURL(/type=/)
    await expect
      .poll(() => callsTo(calls, '/api/search').at(-1)?.params.get('q'))
      .toBe('ミク')
    await expect(
      page.getByRole('button', { name: '詳細条件', exact: true }),
    ).toBeVisible()
    expect(unmocked).toEqual([])
  })

  test('最近の検索に種類つきで残り、選ぶとその場で検索する', async ({
    page,
  }) => {
    const { calls, unmocked } = await mockNetwork(page)
    await openSearch(page)
    await field(page).click()
    await field(page).fill('sm9')
    await field(page).press('Enter')
    await expect(page).toHaveURL(/type=id&q=sm9$/)
    await field(page).fill('ミク')
    await candidates(page)
      .getByRole('option', { name: '「ミク」でユーザーを探す' })
      .click()
    await expect(page).toHaveURL(/type=user/)

    await field(page).fill('')
    await field(page).click()
    const panel = page.getByRole('dialog', { name: '履歴・保存' })
    await expect(panel).toBeVisible()
    const rows = panel.getByRole('listitem')
    await expect(rows.filter({ hasText: 'ユーザー検索' })).toHaveCount(1)
    await expect(rows.filter({ hasText: '動画ID' })).toHaveCount(1)

    const lookups = callsTo(calls, '/api/search/videos').length
    await rows
      .filter({ hasText: '動画ID' })
      .getByRole('button', { name: /^sm9/ })
      .click()
    await expect(page).toHaveURL(/type=id&q=sm9$/)
    await expect
      .poll(() => callsTo(calls, '/api/search/videos').length)
      .toBe(lookups + 1)
    await expect(panel).toBeHidden()
    expect(unmocked).toEqual([])
  })

  test('条件で入力: 3つの欄から検索式を作り、その意味を文章で示して、そのまま検索する', async ({
    page,
  }) => {
    const { calls, unmocked } = await mockNetwork(page)
    await openSearch(page)
    await page
      .getByRole('radiogroup', { name: '入力方法' })
      .getByText('条件で入力')
      .click()
    const add = async (label: string, word: string) => {
      const input = page.getByRole('combobox', { name: label })
      await input.fill(word)
      await input.press('Enter')
      await expect(input).toHaveValue('')
    }
    await add('すべて含む語を追加', '初音ミク')
    await add('いずれかを含む語を追加', '歌ってみた')
    await add('いずれかを含む語を追加', '演奏してみた')
    await add('含めない語を追加', '切り抜き')
    await expect(
      page.getByText(
        '「初音ミク」を含み、「歌ってみた」か「演奏してみた」のどちらかも含む動画を探します。',
        { exact: false },
      ),
    ).toBeVisible()
    await expect(
      page.getByText('「切り抜き」を含む動画は除きます。', { exact: false }),
    ).toBeVisible()

    await page.getByRole('button', { name: /^検索/ }).click()
    const expected = '初音ミク 歌ってみた OR 演奏してみた -切り抜き'
    await expect
      .poll(() => callsTo(calls, '/api/search').at(-1)?.params.get('q'))
      .toBe(expected)
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'))
      .toBe(expected)
    expect(unmocked).toEqual([])
  })

  test('入力を消しても「元に戻す」で戻せる（戻しても勝手に検索しない）', async ({
    page,
  }) => {
    const { calls, unmocked } = await mockNetwork(page)
    await openSearch(page)
    await field(page).fill('初音ミク')
    await page.getByRole('button', { name: '入力を消す' }).click()
    await expect(field(page)).toHaveValue('')
    await page.getByRole('button', { name: '元に戻す' }).click()
    await expect(field(page)).toHaveValue('初音ミク')
    expect(callsTo(calls, '/api/search')).toHaveLength(0)
    expect(unmocked).toEqual([])
  })
})

test.describe('検索ページ（スマートフォン）', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })

  test('ユーザー・動画ID の結果が横にはみ出さず、検索欄は 16px（iOS がフォーカスで拡大しない）', async ({
    page,
  }) => {
    const { unmocked } = await mockNetwork(page)
    const overflows = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )

    await openSearch(page, 'type=user&q=%E3%83%9F%E3%82%AF')
    await expect(
      page.getByRole('link', { name: 'e2e-creator-a', exact: true }),
    ).toBeVisible()
    expect(await overflows()).toBe(false)
    await expect(field(page)).toHaveCSS('font-size', '16px')
    await expect(page.getByLabel('ユーザーの並び順')).toHaveCSS(
      'font-size',
      '16px',
    )

    await openSearch(page, 'type=id&q=sm9+sm404')
    await expect(page.getByText(/sm404 は見つかりませんでした/)).toBeVisible()
    expect(await overflows()).toBe(false)
    expect(unmocked).toEqual([])
  })
})
