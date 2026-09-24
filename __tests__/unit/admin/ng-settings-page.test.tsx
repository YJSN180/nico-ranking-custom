import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// 自動NG パネルと派生NG 一覧は別に試験するので、ここでは受け取った props だけを記録する
interface AutoProps {
  onCopyToManualNG: (authorId: string) => void
  manualAuthorIds: readonly string[]
  canCopyToManualNG?: boolean
}
interface DerivedProps {
  initialData: string[]
  onUpdate?: (newList: string[]) => void
}
let autoProps: AutoProps | null = null
let derivedProps: DerivedProps | null = null

vi.mock('@/app/admin/ng-settings/components/AutoNGPanel', () => ({
  AutoNGPanel: (props: AutoProps) => {
    autoProps = props
    return <div data-testid="auto-ng" />
  },
}))
vi.mock('@/app/admin/ng-settings/components/DerivedNGList', () => ({
  DerivedNGList: (props: DerivedProps) => {
    derivedProps = props
    return <div data-testid="derived-ng" />
  },
}))
vi.mock('@/lib/sentry/capture', () => ({ captureWebException: vi.fn() }))

import NGSettingsPage from '@/app/admin/ng-settings/page'

// 合成値のみ
const manual = { videoIds: ['sm1'], videoTitles: { exact: [], partial: [] }, authorIds: ['12345678'], authorNames: { exact: [], partial: [] } }

const fetchMock = vi.fn()
const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: '', json: async () => body }) as unknown as Response
const postCalls = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/admin/ng-list' && (init as RequestInit | undefined)?.method === 'POST')
const wait = (ms: number) => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, ms))
})

describe('NG設定ページ（手動NG一覧）', () => {
  beforeEach(() => {
    autoProps = null
    derivedProps = null
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
    expect(autoProps?.canCopyToManualNG).toBe(false)

    // 自動NGからの写しや派生NGの更新があっても、自動保存を走らせない
    act(() => {
      autoProps?.onCopyToManualNG('87654321')
      derivedProps?.onUpdate?.(['sm2'])
    })
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
    expect(autoProps?.canCopyToManualNG).toBe(true)
  })

  it('取得できた一覧は編集でき、手動の 4 項目だけを保存する', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/ng-list' && !init?.method) return jsonResponse({ ...manual, derivedVideoIds: ['sm9'] })
      return jsonResponse({ success: true })
    })
    render(<NGSettingsPage />)
    await screen.findByText('12345678')
    fireEvent.change(screen.getByPlaceholderText('例: sm12345'), { target: { value: 'sm2' } })
    fireEvent.click(screen.getAllByRole('button', { name: '追加' })[0])
    await waitFor(() => expect(postCalls()).toHaveLength(1), { timeout: 2000 })
    const body = JSON.parse(String((postCalls()[0][1] as RequestInit).body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['authorIds', 'authorNames', 'videoIds', 'videoTitles'])
    expect(body.videoIds).toEqual(['sm1', 'sm2'])
  })
})
