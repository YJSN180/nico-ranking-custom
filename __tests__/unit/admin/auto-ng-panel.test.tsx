import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AutoNGPanel } from '@/app/admin/ng-settings/components/AutoNGPanel'

// 合成データのみ
const overview = {
  envEnabled: true,
  config: {
    version: 1,
    enabled: true,
    pollTags: ['t1'],
    sweepGenre: 'g',
    titleNeedles: ['てすとまん'],
    keywordNeedles: [],
    tagGroups: [['a'], ['b'], ['c']],
    lockGroupsMin: 3,
    freq: { dayCount: 5, burstCount: 3, burstMinutes: 30 },
    followerMax: 10,
    holdHours: 6,
    trackDays: 7,
    deletionWindowDays: 7,
    allowlist: { authorIds: ['9001'], videoIds: [], notes: { '9001': '確認済み' } },
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  verdicts: {
    version: 1,
    updatedAt: '2026-01-02T00:00:00.000Z',
    authors: {
      '1001': { status: 'ng', reasons: ['B'], since: '2026-01-02T00:00:00.000Z', evidence: [{ videoId: 'sm1', title: 'て・す・と・ま・ん', registeredAt: '2026-01-02T00:00:00.000Z', rules: ['B'] }], nickname: 'なまえ', followerCount: 3 },
      '9001': { status: 'ng', reasons: ['D'], since: '2026-01-02T00:00:00.000Z', evidence: [], nickname: 'ゆるされた' },
    },
    videos: {
      sm1: { status: 'ng', reasons: ['B'], authorId: '1001', title: 'て・す・と・ま・ん', registeredAt: '2026-01-02T00:00:00.000Z', since: '2026-01-02T00:00:00.000Z' },
      sm2: { status: 'hold', reasons: [], holdSignals: ['hidden_owner'], authorId: '1002', title: '保留の動画', registeredAt: '2026-01-02T00:00:00.000Z', since: '2026-01-02T00:00:00.000Z', holdUntil: '2026-01-02T06:00:00.000Z' },
    },
  },
  events: { items: [{ at: '2026-01-02T00:00:00.000Z', kind: 'author_ng', authorId: '1001', id: 'sm1', reasons: ['B'] }], lastRun: { at: '2026-01-02T00:00:00.000Z', mode: 'poll', newVideos: 1, enriched: 1, usersChecked: 1, subrequests: 5, kvWrites: 3 } },
  tracking: { lastPollAt: '2026-01-02T00:00:00.000Z', lastSweepDate: '2026-01-01', trackedAuthors: 2, pendingVideos: 0 },
}

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response

describe('AutoNGPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/allowlist') {
        const body = JSON.parse(String(init?.body)) as { action: string; id: string }
        const authorIds = body.action === 'add' ? ['9001', body.id] : ['9001'].filter((x) => x !== body.id)
        // API は保存後の設定全体（版番号つき）を返す
        return jsonResponse({ success: true, config: { ...overview.config, allowlist: { authorIds, videoIds: [], notes: {} }, updatedAt: '2026-01-03T00:00:00.000Z' } })
      }
      if (url === '/api/admin/lqng/config') return jsonResponse({ success: true, config: { ...overview.config, holdHours: 12 } })
      return jsonResponse({ error: 'not found' }, 404)
    })
  })

  it('概要を読み込み、件数と稼働状態を表示する', async () => {
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    expect(await screen.findByText('● 稼働中')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /投稿者NG/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /動画NG/ })).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /保留/ })).toHaveTextContent('1')
    expect(screen.getByText(/直近の実行/)).toHaveTextContent('新着 1 本')
  })

  it('投稿者タブで理由と根拠を出し、許可リストへ追加できる', async () => {
    render(<AutoNGPanel manualAuthorIds={['1001']} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    expect(screen.getByText('なまえ')).toBeInTheDocument()
    expect(screen.getAllByText('B タイトル').length).toBeGreaterThan(0)
    expect(screen.getByText('手動NG済み')).toBeDisabled()
    // 許可リスト済みの投稿者は「許可を解除」、未登録は「許可リストへ」
    expect(screen.getByText('許可を解除')).toBeInTheDocument()
    fireEvent.click(screen.getByText('許可リストへ'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/lqng/allowlist', expect.objectContaining({ method: 'POST' })))
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/admin/lqng/allowlist')!
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ action: 'add', kind: 'author', id: '1001' })
    await waitFor(() => expect(screen.getAllByText('許可を解除')).toHaveLength(2))
  })

  it('許可リストの更新後は、応答に含まれる設定全体で状態を置き換える', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/allowlist') {
        // 別の画面で日次スイープのジャンルが変わっていた（許可リスト以外も最新になる）
        return jsonResponse({ success: true, config: { ...overview.config, sweepGenre: 'べつのジャンル', allowlist: { authorIds: ['9001', '1001'], videoIds: [] }, updatedAt: '2026-01-03T00:00:00.000Z' } })
      }
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    fireEvent.click(screen.getByText('許可リストへ'))
    await waitFor(() => expect(screen.getAllByText('許可を解除')).toHaveLength(2))
    fireEvent.click(screen.getByRole('tab', { name: /概要/ }))
    expect(screen.getByText('ジャンル: べつのジャンル')).toBeInTheDocument()
  })

  it('「手動NGに写す」はコールバックに投稿者 ID を渡す', async () => {
    const copy = vi.fn()
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={copy} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    fireEvent.click(screen.getAllByText('手動NGに写す')[0]!)
    expect(copy).toHaveBeenCalledWith('1001')
  })

  it('保留タブは信号と期限を表示する', async () => {
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /保留/ }))
    expect(screen.getByText('保留の動画')).toBeInTheDocument()
    expect(screen.getByText('投稿者が非公開')).toBeInTheDocument()
  })

  it('設定タブは変更を検知し、保存で PUT する', async () => {
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    const save = screen.getByRole('button', { name: '設定を保存' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    expect(save).toBeEnabled()
    fireEvent.click(save)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/lqng/config', expect.objectContaining({ method: 'PUT' })))
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/admin/lqng/config')!
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ holdHours: 12, tagGroups: [['a'], ['b'], ['c']] })
    expect(await screen.findByText(/保存しました/)).toBeInTheDocument()
  })

  it('読み込み失敗はエラー表示になる', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'x' }, 500))
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    expect(await screen.findByText(/読み込みに失敗しました/)).toBeInTheDocument()
  })

  it('再読み込みに失敗したら、保存・許可リストの操作を無効にして理由を表示する', async () => {
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'KV unavailable' }, 503))
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText(/読み込みに失敗しました \(503\)/)).toBeInTheDocument()
    expect(screen.getByText(/保存と許可リストの操作を止めています/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    expect(screen.getByText('許可リストへ')).toBeDisabled()
    expect(screen.getByText('許可を解除')).toBeDisabled()
    fireEvent.click(screen.getByRole('tab', { name: /許可リスト/ }))
    for (const button of screen.getAllByRole('button', { name: '削除' })) expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })
    expect(screen.getByRole('button', { name: '設定を保存' })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/lqng/allowlist', expect.anything())

    // 読み直しに成功すれば操作できる状態に戻る
    fetchMock.mockImplementation(async (url: string) => (url === '/api/admin/lqng/overview' ? jsonResponse(overview) : jsonResponse({ error: 'not found' }, 404)))
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(screen.queryByText(/読み込みに失敗しました/)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    expect(screen.getByText('許可リストへ')).toBeEnabled()
  })
})
