import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// 派生NG 一覧は別に試験するので、ここでは表示されたかだけを見る
vi.mock('@/app/admin/ng-settings/components/DerivedNGList', () => ({
  DerivedNGList: (): React.JSX.Element => <div data-testid="derived-ng" />,
}))
vi.mock('@/lib/sentry/capture', () => ({ captureWebException: vi.fn() }))

import NGSettingsPage from '@/app/admin/ng-settings/page'

// 合成値のみ
const manual = { videoIds: ['sm1'], videoTitles: { exact: [], partial: [] }, authorIds: ['12345678'], authorNames: { exact: [], partial: [] } }

const fetchMock = vi.fn()
const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const postCalls = (): unknown[][] => fetchMock.mock.calls.filter(([url, init]) => url === '/api/admin/ng-list' && (init as RequestInit | undefined)?.method === 'POST')
const wait = (ms: number): Promise<void> => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, ms))
})

describe('NG設定ページ（手動NG一覧）', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('alert', vi.fn())
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('一覧の取得に失敗したら編集できない状態で表示し、空の一覧から保存しない', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/ng-list' && !init?.method) return jsonResponse({ error: 'Failed to fetch NG list' }, 503)
      return jsonResponse({ success: true })
    })
    render(<NGSettingsPage />)

    expect(await screen.findByText(/手動NGリストを読み込めませんでした \(503\)/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('例: sm12345')).toBeDisabled()
    expect(screen.getByPlaceholderText('投稿者のID')).toBeDisabled()
    expect(screen.getByRole('button', { name: '設定を保存' })).toBeDisabled()
    // 派生NGを 0 件として表示しない
    expect(screen.queryByTestId('derived-ng')).not.toBeInTheDocument()
    expect(screen.getByText(/派生NGリストを読み込めませんでした/)).toBeInTheDocument()

    // 自動保存も走らない
    await wait(900)
    expect(postCalls()).toHaveLength(0)
  })

  it('読み直しに成功すれば編集できる状態に戻る', async () => {
    let fail = true
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/ng-list' && !init?.method) return fail ? jsonResponse({ error: 'x' }, 503) : jsonResponse({ ...manual, derivedVideoIds: [] })
      return jsonResponse({ success: true })
    })
    render(<NGSettingsPage />)
    await screen.findByText(/手動NGリストを読み込めませんでした/)
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(screen.queryByText(/手動NGリストを読み込めませんでした/)).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText('例: sm12345')).toBeEnabled()
    expect(screen.getByText('12345678')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '設定を保存' })).toBeEnabled()
  })

  it('取得できた一覧は編集でき、手動の 4 項目だけを保存する', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/ng-list' && !init?.method) return jsonResponse({ ...manual, derivedVideoIds: ['sm9'] })
      return jsonResponse({ success: true })
    })
    render(<NGSettingsPage />)
    await screen.findByText('12345678')
    expect(screen.getByTestId('derived-ng')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('例: sm12345'), { target: { value: 'sm2' } })
    const [addVideoIdButton] = screen.getAllByRole('button', { name: '追加' })
    if (!addVideoIdButton) throw new Error('add button not found')
    fireEvent.click(addVideoIdButton)
    await waitFor(() => expect(postCalls()).toHaveLength(1), { timeout: 2000 })
    const init = postCalls()[0]?.[1] as RequestInit | undefined
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['authorIds', 'authorNames', 'videoIds', 'videoTitles'])
    expect(body.videoIds).toEqual(['sm1', 'sm2'])
  })
})
