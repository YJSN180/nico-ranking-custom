import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

  it('許可リストの操作は読み込んだ版（updatedAt）を付けて送り、次の操作は応答の新しい版で送る', async () => {
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    fireEvent.click(screen.getByText('許可リストへ'))
    await waitFor(() => expect(screen.getAllByText('許可を解除')).toHaveLength(2))
    fireEvent.click(screen.getAllByText('許可を解除')[0])
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/admin/lqng/allowlist')).toHaveLength(2))
    const bodies = fetchMock.mock.calls.filter((c) => c[0] === '/api/admin/lqng/allowlist').map((c) => JSON.parse(String((c[1] as RequestInit).body)) as { updatedAt: string })
    expect(bodies.map((b) => b.updatedAt)).toEqual(['2026-01-01T00:00:00.000Z', '2026-01-03T00:00:00.000Z'])
  })

  it('許可リストの操作が 409 なら、最新の設定を読み直すよう案内する', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/allowlist') return jsonResponse({ error: 'Config version conflict' }, 409)
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    fireEvent.click(screen.getByText('許可リストへ'))
    expect(await screen.findByText(/他の画面で設定が更新されています/)).toHaveTextContent('再読み込み')
  })

  it('設定の保存中は許可リストの操作を止め、許可リストの操作中は設定を保存させない', async () => {
    let finishPut: (value: Response) => void = () => {}
    let finishAllowlist: (value: Response) => void = () => {}
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/config') return new Promise<Response>((resolve) => (finishPut = resolve))
      if (url === '/api/admin/lqng/allowlist') return new Promise<Response>((resolve) => (finishAllowlist = resolve))
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')

    // 設定を保存している最中
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/lqng/config', expect.objectContaining({ method: 'PUT' })))
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    expect(screen.getByText('許可リストへ')).toBeDisabled()
    expect(screen.getByText('許可を解除')).toBeDisabled()
    fireEvent.click(screen.getByRole('tab', { name: /許可リスト/ }))
    for (const button of screen.getAllByRole('button', { name: '削除' })) expect(button).toBeDisabled()
    await act(async () => {
      finishPut(jsonResponse({ success: true, config: { ...overview.config, holdHours: 12, updatedAt: '2026-01-03T00:00:00.000Z' } }))
    })
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    await waitFor(() => expect(screen.getByText('許可リストへ')).toBeEnabled())

    // 許可リストを操作している最中
    fireEvent.click(screen.getByText('許可リストへ'))
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '24' } })
    expect(screen.getByRole('button', { name: '設定を保存' })).toBeDisabled()
    await act(async () => {
      finishAllowlist(jsonResponse({ success: true, config: { ...overview.config, holdHours: 12, allowlist: { authorIds: ['9001', '1001'], videoIds: [] }, updatedAt: '2026-01-04T00:00:00.000Z' } }))
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '設定を保存' })).toBeEnabled())
  })

  it('許可リストへの追加が 400 なら ID の形式を案内する', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/allowlist') return jsonResponse({ error: 'Invalid allowlist request' }, 400)
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /許可リスト/ }))
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'video' } })
    fireEvent.change(screen.getByLabelText('ID'), { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(await screen.findByText(/ID の形式を確認してください/)).toHaveTextContent('ss')
  })

  it('「手動NGに写す」はコールバックに投稿者 ID を渡す', async () => {
    const copy = vi.fn()
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={copy} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    fireEvent.click(screen.getAllByText('手動NGに写す')[0]!)
    expect(copy).toHaveBeenCalledWith('1001')
  })

  it('手動NG一覧を読めていないときは「手動NGに写す」を押せない', async () => {
    const copy = vi.fn()
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={copy} canCopyToManualNG={false} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    for (const button of screen.getAllByText('手動NGに写す')) expect(button).toBeDisabled()
    fireEvent.click(screen.getAllByText('手動NGに写す')[0])
    expect(copy).not.toHaveBeenCalled()
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
    const sent = JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>
    expect(sent).toMatchObject({ holdHours: 12, tagGroups: [['a'], ['b'], ['c']] })
    // 版番号（読み込んだ設定の updatedAt）を付け、許可リストは送らない（差分 API だけで変える）
    expect(sent.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(sent).not.toHaveProperty('allowlist')
    expect(await screen.findByText(/保存しました/)).toBeInTheDocument()
  })

  it('保存後の「保存しました」は設定の置き換えで消えず、下書きは保存後の値になる', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/config') {
        // 実際の通信のようにタスクをまたいで応答する（マイクロタスクだけだと取り違えを再現できない）
        await new Promise((resolve) => setTimeout(resolve, 10))
        return jsonResponse({ success: true, config: { ...overview.config, holdHours: 12, updatedAt: '2026-01-03T00:00:00.000Z' } })
      }
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    // 親が応答の設定で状態を置き換えたあとも残る
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(screen.getByText(/保存しました/)).toBeInTheDocument()
    expect(screen.getByLabelText('保留時間（時間）')).toHaveValue(12)
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '設定を保存' })).toBeDisabled()
  })

  it('照合語が正規化後 3 文字未満、または数値が範囲外なら理由を出して保存させない', async () => {
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    const save = screen.getByRole('button', { name: '設定を保存' })

    fireEvent.change(screen.getByLabelText('照合語（B、1 行 1 語）'), { target: { value: 'てすとまん\nＡＢ' } })
    expect(screen.getByText(/照合語「ＡＢ」は正規化すると 2 文字です/)).toBeInTheDocument()
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('照合語（B、1 行 1 語）'), { target: { value: 'てすとまん' } })
    expect(screen.queryByText(/照合語「/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('フォロワー上限（人）'), { target: { value: '5000' } })
    expect(screen.getByText(/フォロワー上限は 0〜1000 の整数にしてください/)).toBeInTheDocument()
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('フォロワー上限（人）'), { target: { value: '10' } })

    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '1000' } })
    expect(screen.getByText(/保留時間は 0〜168 の整数にしてください/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })

    fireEvent.change(screen.getByLabelText('投稿者の追跡日数'), { target: { value: '1' } })
    expect(screen.getByText(/投稿者の追跡日数は 2〜30 の整数にしてください/)).toBeInTheDocument()
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('投稿者の追跡日数'), { target: { value: '7' } })
    expect(save).toBeEnabled()
  })

  it('設定の保存が 400 なら、サーバーが返した理由を表示する', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/config') return jsonResponse({ error: 'Invalid config', problems: ['理由その1', '理由その2'] }, 400)
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    expect(await screen.findByText(/理由その1/)).toHaveTextContent('理由その2')
  })

  it('設定の保存が 409 なら、最新の設定を読み直すよう案内する', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/config') return jsonResponse({ error: 'Config version conflict' }, 409)
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    expect(await screen.findByText(/他の画面で設定が更新されています/)).toHaveTextContent('再読み込み')
  })

  it('409 のあと再読み込みしても下書きは消えず、編集した項目だけを残して最新の設定と版に載せ替える', async () => {
    // 他の画面でフォロワー上限が 10 → 20 に変わり、版が進んでいた
    const latest = { ...overview.config, followerMax: 20, updatedAt: '2026-01-05T00:00:00.000Z' }
    let reloaded = false
    const puts: Array<Record<string, unknown>> = []
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(reloaded ? { ...overview, config: latest } : overview)
      if (url === '/api/admin/lqng/config') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        puts.push(body)
        if (body.updatedAt !== latest.updatedAt) return jsonResponse({ error: 'Config version conflict' }, 409)
        return jsonResponse({ success: true, config: { ...latest, ...body, allowlist: latest.allowlist, updatedAt: '2026-01-06T00:00:00.000Z' } })
      }
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    fireEvent.change(screen.getByLabelText('保留時間（時間）'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    expect(await screen.findByText(/他の画面で設定が更新されています/)).toBeInTheDocument()

    reloaded = true
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText(/最新の設定を読み込みました/)).toHaveTextContent('編集中だった項目はそのまま残しています')
    expect(screen.queryByText(/他の画面で設定が更新されています/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('保留時間（時間）')).toHaveValue(12)
    expect(screen.getByLabelText('フォロワー上限（人）')).toHaveValue(20)

    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
    expect(await screen.findByText(/保存しました/)).toBeInTheDocument()
    expect(puts[1]).toMatchObject({ updatedAt: latest.updatedAt, holdHours: 12, followerMax: 20 })
  })

  it('編集していないときの再読み込みでは、他の画面で変わった値に置き換える（案内は出さない）', async () => {
    let reloaded = false
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(reloaded ? { ...overview, config: { ...overview.config, holdHours: 8, updatedAt: '2026-01-05T00:00:00.000Z' } } : overview)
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
    reloaded = true
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(screen.getByLabelText('保留時間（時間）')).toHaveValue(8))
    expect(screen.queryByText(/最新の設定を読み込みました/)).not.toBeInTheDocument()
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '設定を保存' })).toBeDisabled()
  })

  it('許可リストの操作中は、他の行の許可リストボタンも無効にする', async () => {
    let finish: (value: Response) => void = () => {}
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/lqng/overview') return jsonResponse(overview)
      if (url === '/api/admin/lqng/allowlist') return new Promise<Response>((resolve) => (finish = resolve))
      return jsonResponse({ error: 'not found' }, 404)
    })
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    await screen.findByText('● 稼働中')
    fireEvent.click(screen.getByRole('tab', { name: /投稿者NG/ }))
    fireEvent.click(screen.getByText('許可リストへ'))
    // 押した行（1001）だけでなく、別の行（9001 の「許可を解除」）も止まる
    await waitFor(() => expect(screen.getByText('許可を解除')).toBeDisabled())
    expect(screen.getByText('許可リストへ')).toBeDisabled()
    finish(jsonResponse({ success: true, config: { ...overview.config, allowlist: { authorIds: ['9001', '1001'], videoIds: [] }, updatedAt: '2026-01-03T00:00:00.000Z' } }))
    await waitFor(() => expect(screen.getAllByText('許可を解除')).toHaveLength(2))
    for (const button of screen.getAllByText('許可を解除')) expect(button).toBeEnabled()
  })

  it('読み込み失敗はエラー表示になる', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'x' }, 500))
    render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
    expect(await screen.findByText(/読み込みに失敗しました/)).toBeInTheDocument()
  })

  describe('退会確認の対照（controlUserId）', () => {
    const withConfig = (config: Record<string, unknown>) => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/admin/lqng/overview') return jsonResponse({ ...overview, config: { ...overview.config, ...config } })
        if (url === '/api/admin/lqng/config') {
          const sent = JSON.parse(String(init?.body)) as Record<string, unknown>
          return jsonResponse({ success: true, config: { ...sent, allowlist: overview.config.allowlist, updatedAt: '2026-01-03T00:00:00.000Z' } })
        }
        return jsonResponse({ error: 'not found' }, 404)
      })
    }
    const missingWarning = /対照の投稿者 ID が未設定です/

    it('自動NG が有効なのに未設定なら、概要と設定フォームに警告を出す', async () => {
      render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText('● 稼働中')
      expect(screen.getByText(missingWarning)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
      expect(screen.getByText(missingWarning)).toBeInTheDocument()
      // 説明つきの入力欄がある
      expect(screen.getByText(/存在が確実な投稿者の ID/)).toHaveTextContent('ニコニコの API の異常を見分ける')
      fireEvent.change(screen.getByLabelText('対照の投稿者 ID'), { target: { value: '12345' } })
      expect(screen.queryByText(missingWarning)).not.toBeInTheDocument()
    })

    it('設定済み、または自動NG が無効なら警告を出さない', async () => {
      withConfig({ controlUserId: '12345' })
      const { unmount } = render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText('● 稼働中')
      expect(screen.queryByText(missingWarning)).not.toBeInTheDocument()
      unmount()
      withConfig({ enabled: false })
      render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText(/設定で無効/)
      expect(screen.queryByText(missingWarning)).not.toBeInTheDocument()
    })

    it('設定タブで入力して保存でき、空にすると設定を外す（読み込んだだけでは未保存にならない）', async () => {
      withConfig({})
      render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText('● 稼働中')
      fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
      const save = screen.getByRole('button', { name: '設定を保存' })
      expect(save).toBeDisabled()
      fireEvent.change(screen.getByLabelText('対照の投稿者 ID'), { target: { value: ' 12345 ' } })
      fireEvent.click(save)
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/lqng/config', expect.objectContaining({ method: 'PUT' })))
      const first = fetchMock.mock.calls.filter((c) => c[0] === '/api/admin/lqng/config')
      expect(JSON.parse(String((first[0]![1] as RequestInit).body))).toMatchObject({ controlUserId: '12345' })
      expect(await screen.findByText(/保存しました/)).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('対照の投稿者 ID'), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))
      await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/admin/lqng/config')).toHaveLength(2))
      const second = fetchMock.mock.calls.filter((c) => c[0] === '/api/admin/lqng/config')[1]!
      expect(JSON.parse(String((second[1] as RequestInit).body))).not.toHaveProperty('controlUserId')
    })

    it('設定した対照が直近の確認で見つからなければ（404）、概要に警告を出す', async () => {
      const notFoundWarning = /設定した対照の投稿者 ID が見つかりません/
      const withOverview = (over: Record<string, unknown>, tracking: Record<string, unknown>) => {
        fetchMock.mockImplementation(async (url: string) =>
          url === '/api/admin/lqng/overview' ? jsonResponse({ ...overview, config: { ...overview.config, ...over }, tracking: { ...overview.tracking, ...tracking } }) : jsonResponse({ error: 'not found' }, 404)
        )
      }
      withOverview({ controlUserId: '12345' }, { controlNotFound: true })
      const { unmount } = render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText('● 稼働中')
      expect(screen.getByText(notFoundWarning)).toHaveTextContent('「設定」タブの「退会の判定」')
      expect(screen.queryByText(missingWarning)).not.toBeInTheDocument()
      unmount()
      // 見つかっている、または自動NG が無効なら出さない
      withOverview({ controlUserId: '12345' }, { controlNotFound: false })
      const second = render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText('● 稼働中')
      expect(screen.queryByText(notFoundWarning)).not.toBeInTheDocument()
      second.unmount()
      withOverview({ controlUserId: '12345', enabled: false }, { controlNotFound: true })
      render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText(/設定で無効/)
      expect(screen.queryByText(notFoundWarning)).not.toBeInTheDocument()
    })

    it('数字でなければ理由を出して保存させない', async () => {
      render(<AutoNGPanel manualAuthorIds={[]} onCopyToManualNG={() => {}} />)
      await screen.findByText('● 稼働中')
      fireEvent.click(screen.getByRole('tab', { name: /設定/ }))
      fireEvent.change(screen.getByLabelText('対照の投稿者 ID'), { target: { value: 'user12' } })
      expect(screen.getByText('退会確認の対照のユーザー ID は数字 1〜12 桁にしてください')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '設定を保存' })).toBeDisabled()
    })
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
