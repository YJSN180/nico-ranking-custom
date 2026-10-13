import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagAutocompleteInput } from '@/components/tag-autocomplete-input'

vi.mock('@/lib/sentry/capture', () => ({
  captureBrowserRateLimit: vi.fn(),
}))

function ControlledTagAutocompleteInput() {
  const [value, setValue] = useState('')

  return (
    <TagAutocompleteInput
      value={value}
      onChange={setValue}
      placeholder="タグを入力"
    />
  )
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function PickingTagAutocompleteInput({ onPick }: { onPick: (tag: string) => void }) {
  const [value, setValue] = useState('')

  return (
    <TagAutocompleteInput
      value={value}
      onChange={setValue}
      onPick={(tag) => {
        setValue('')
        onPick(tag)
      }}
      placeholder="語を追加"
    />
  )
}

describe('TagAutocompleteInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps only the latest autocomplete response', async () => {
    const first = createDeferred<Response>()
    const second = createDeferred<Response>()

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    )

    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByPlaceholderText('タグを入力')
    input.focus()

    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    fireEvent.change(input, { target: { value: 'voc' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await act(async () => {
      second.resolve(
        new Response(JSON.stringify({ suggestions: ['VOCALOID'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      await Promise.resolve()
    })

    expect(await screen.findByText('VOCALOID')).toBeInTheDocument()

    await act(async () => {
      first.resolve(
        new Response(JSON.stringify({ suggestions: ['VOICEROID'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      await Promise.resolve()
    })

    expect(screen.queryByText('VOICEROID')).not.toBeInTheDocument()
    expect(screen.getByText('VOCALOID')).toBeInTheDocument()
  })

  it('候補と入力欄を関連づけ、矢印で選択しIME確定では選ばない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ suggestions: ['VOCALOID', 'VOICEROID'] }), { status: 200 })))
    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByRole('combobox', { name: 'タグを入力' })
    input.focus()
    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    const list = screen.getByRole('listbox', { name: 'タグ候補' })
    expect(input).toHaveAttribute('aria-controls', list.id)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const option = screen.getByRole('option', { name: 'VOCALOID' })
    expect(option).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', option.id)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(input).toHaveValue('vo')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('VOCALOID')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('入力欄を離れた後の遅い応答で候補を開き直さない', async () => {
    const response = createDeferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => response.promise))
    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByRole('combobox', { name: 'タグを入力' })
    input.focus()
    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    input.blur()
    await act(async () => {
      response.resolve(new Response(JSON.stringify({ suggestions: ['VOCALOID'] }), { status: 200 }))
      await Promise.resolve()
    })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('別の入力欄へ移ったら前の候補を閉じる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ suggestions: ['VOCALOID'] }), { status: 200 })))
    render(<><ControlledTagAutocompleteInput /><input aria-label="次のタグ" /></>)
    const input = screen.getByRole('combobox', { name: 'タグを入力' })
    input.focus()
    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    act(() => screen.getByLabelText('次のタグ').focus())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('captures autocomplete 429s in Sentry', async () => {
    const { captureBrowserRateLimit } = await import('@/lib/sentry/capture')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { 'retry-after': '10' },
        }),
      ),
    )

    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByPlaceholderText('タグを入力')
    input.focus()

    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(captureBrowserRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'tag-autocomplete',
        endpointFamily: '/api/tags/autocomplete',
        fingerprint: ['browser-tag-autocomplete-429'],
        retryAfterSeconds: 10,
      }),
    )
  })
})

describe('search autocomplete interaction and request budget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: ['初音ミク', '初音ミクオリジナル曲'] }))))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  function SearchInput({ initial = '', mode = 'query' }: { initial?: string; mode?: 'tag' | 'query' }) {
    const [value, setValue] = useState(initial)
    return <TagAutocompleteInput value={value} onChange={setValue} ariaLabel="検索キーワード" completionMode={mode} />
  }
  async function advance() { await act(async () => { vi.advanceTimersByTime(300) }) }
  function type(value: string) {
    const input = screen.getByRole('combobox') as HTMLInputElement
    act(() => input.focus())
    fireEvent.change(input, { target: { value } })
    return input
  }

  it('debounces, waits for 2 characters and reuses a bounded short-lived cache', async () => {
    render(<SearchInput />)
    const input = type('初')
    await advance()
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '初音' } })
    fireEvent.change(input, { target: { value: '初音ミ' } })
    await advance()
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.change(input, { target: { value: '初音ミ' } })
    await advance()
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000) })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.change(input, { target: { value: '初音ミ' } })
    await advance()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not fetch during IME composition or submit when confirming composition', async () => {
    const submit = vi.fn(e => e.preventDefault())
    render(<form onSubmit={submit}><SearchInput /><button type="submit">検索</button></form>)
    const input = screen.getByRole('combobox')
    act(() => input.focus())
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '初音' } })
    await advance()
    expect(fetch).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(false)
    expect(submit).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    await advance()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('completes only the term and does not submit or reopen on selection', async () => {
    const submit = vi.fn(e => e.preventDefault())
    render(<form onSubmit={submit}><SearchInput /></form>)
    const input = type('ゲーム OR 初音')
    await advance()
    expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).searchParams.get('q')).toBe('初音')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('ゲーム OR 初音ミク')
    expect(submit).not.toHaveBeenCalled()
    fireEvent.select(input)
    await advance()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
    // Unselected Enter must keep the native form submission behavior.
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
  })

  it('completes in the middle and restores the caret while preserving suffixes', async () => {
    render(<SearchInput initial="初音 OR ゲーム" />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    act(() => { input.focus(); input.setSelectionRange(2, 2) })
    fireEvent.select(input)
    await advance()
    fireEvent.click(screen.getByRole('option', { name: '初音ミク', exact: true }))
    expect(input).toHaveValue('初音ミク OR ゲーム')
    expect(input.selectionStart).toBe(4)
  })

  it('Escape cancels a pending response and never reopens the popup', async () => {
    const pending = createDeferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))
    render(<SearchInput />)
    const input = type('初音')
    await advance()
    fireEvent.keyDown(input, { key: 'Escape' })
    await act(async () => { pending.resolve(new Response(JSON.stringify({ suggestions: ['初音ミク'] }))) })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('初音')
  })

  it('honors Retry-After without automatic retries and keeps manual entry usable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {status:429,headers:{'retry-after':'10'}})))
    render(<SearchInput />)
    const input = type('初音')
    await advance()
    fireEvent.change(input, { target: { value: '初音ミ' } })
    await advance()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue('初音ミ')
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.change(input, { target: { value: '初音ミク' } })
    await advance()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('aborts timed-out requests, and disabled/reset fields cannot show stale suggestions', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      signal = options.signal
      return new Promise(() => {})
    }))
    const { rerender } = render(<TagAutocompleteInput value="初音" onChange={() => {}} />)
    act(() => screen.getByRole('combobox').focus())
    await advance()
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(signal?.aborted).toBe(true)
    rerender(<TagAutocompleteInput value="" disabled onChange={() => {}} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('autocomplete limits and literal tag compatibility', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.restoreAllMocks() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  const tick = async () => { await act(async () => { vi.advanceTimersByTime(300) }) }

  it('evicts old cache entries after 100 different terms', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }))))
    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByRole('combobox')
    act(() => input.focus())
    for (let i = 0; i < 101; i++) {
      fireEvent.change(input, { target: { value: `tag${i}` } })
      await tick()
    }
    expect(fetch).toHaveBeenCalledTimes(101)
    fireEvent.change(input, { target: { value: 'tag0' } })
    await tick()
    expect(fetch).toHaveBeenCalledTimes(102)
  })

  it('keeps a multi-word literal tag intact and forwards only an unselected Enter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: ['東方 project'] }))))
    const enter = vi.fn()
    function Literal() {
      const [value, setValue] = useState('')
      return <TagAutocompleteInput value={value} onChange={setValue} onKeyPress={enter} />
    }
    render(<Literal />)
    const input = screen.getByRole('combobox')
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '東方 pro' } })
    await tick()
    expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).searchParams.get('q')).toBe('東方 pro')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('東方 project')
    expect(enter).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(enter).toHaveBeenCalledTimes(1)
  })

  it('bounds and validates candidate responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [null, 7, '', 'x'.repeat(101), ...Array.from({ length: 30 }, (_, i) => `tag${i}`), 'tag0'] }))))
    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByRole('combobox')
    act(() => input.focus())
    fireEvent.change(input, { target: { value: 'tag' } })
    await tick()
    expect(screen.getAllByRole('option')).toHaveLength(10)
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('tag0')
  })

  it('onPick があるタグ欄では、選んだ候補を値にせず渡す（複数の語を集める欄）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ suggestions: ['VOCALOID'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const onPick = vi.fn()
    render(<PickingTagAutocompleteInput onPick={onPick} />)
    const input = screen.getByPlaceholderText('語を追加')
    input.focus()
    fireEvent.change(input, { target: { value: 'vo' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('VOCALOID')
    expect(input).toHaveValue('')
    expect(document.activeElement).toBe(input)
  })

  it('操作の行は候補の後に同じ一覧で出し、矢印と Enter で選べる（候補の取得を待ってから一緒に出す）', async () => {
    let resolveFetch: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve })))
    const onSelect = vi.fn()
    function WithAction() {
      const [value, setValue] = useState('')
      return <TagAutocompleteInput value={value} onChange={setValue} completionMode="query" placeholder="語" actions={[{ key: 'users', label: 'ユーザーを探す', onSelect }]} />
    }
    render(<WithAction />)
    const input = screen.getByPlaceholderText('語')
    input.focus()
    fireEvent.change(input, { target: { value: 'vo' } })
    // 候補の問い合わせ中は操作の行も出さない（届いた候補で行が動かないように）
    expect(screen.queryByRole('option', { name: 'ユーザーを探す' })).toBeNull()
    await tick()
    await act(async () => { resolveFetch(new Response(JSON.stringify({ suggestions: ['VOCALOID'] }))) })
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['VOCALOID', 'ユーザーを探す'])
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('入力が途中で動画IDになったら、前の入力で始めた候補の取得をやめ、候補を出さない', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ suggestions: ['第一話→so1'] })))
    vi.stubGlobal('fetch', fetchSpy)
    function MaybeId() {
      const [value, setValue] = useState('')
      const isId = /^so\d+$/.test(value)
      return <TagAutocompleteInput value={value} onChange={setValue} completionMode="query" placeholder="欄" suggest={!isId} actions={isId ? [{ key: 'ids', label: `動画 ${value} を表示`, onSelect: () => {} }] : []} />
    }
    render(<MaybeId />)
    const input = screen.getByPlaceholderText('欄')
    input.focus()
    fireEvent.change(input, { target: { value: 'so' } })
    fireEvent.change(input, { target: { value: 'so1' } })
    await tick()
    await act(async () => { await Promise.resolve() })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['動画 so1 を表示'])
  })

  it('suggest={false} では候補を取りに行かず、操作の行だけをすぐ出す', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    function IdField() {
      const [value, setValue] = useState('')
      return <TagAutocompleteInput value={value} onChange={setValue} completionMode="query" placeholder="ID" suggest={false} actions={[{ key: 'ids', label: '動画 sm9 を表示', onSelect: () => {} }]} />
    }
    render(<IdField />)
    const input = screen.getByPlaceholderText('ID')
    input.focus()
    fireEvent.change(input, { target: { value: 'sm9' } })
    expect(screen.getByRole('option', { name: '動画 sm9 を表示' })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('操作の行を選んだ後・Escape の後は、入力し直すまで一覧を開き直さない（表示の切り替えや選択位置の変化でも）', () => {
    vi.stubGlobal('fetch', vi.fn())
    function Switching() {
      const [value, setValue] = useState('')
      const [users, setUsers] = useState(false)
      const action = users
        ? { key: 'videos', label: '動画を探す', onSelect: () => setUsers(false) }
        : { key: 'users', label: 'ユーザーを探す', onSelect: () => setUsers(true) }
      return <TagAutocompleteInput value={value} onChange={setValue} completionMode="query" placeholder="欄" suggest={!users} actions={[action]} />
    }
    render(<Switching />)
    const input = screen.getByPlaceholderText('欄')
    input.focus()
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('option', { name: 'ユーザーを探す' }))
    // 表示が切り替わり（suggest が変わり）、選択位置の変化が届いても開かない
    fireEvent.select(input)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(input, { target: { value: 'xy' } })
    expect(screen.getByRole('option', { name: '動画を探す' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.select(input)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

it('shares an in-flight lookup when moving the caret within the same term', async () => {
  vi.useFakeTimers()
  const pending = createDeferred<Response>()
  vi.stubGlobal('fetch', vi.fn(() => pending.promise))
  try {
    render(<ControlledTagAutocompleteInput />)
    const input = screen.getByRole('combobox') as HTMLInputElement
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '初音ミ' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    input.setSelectionRange(2, 2)
    fireEvent.select(input)
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { pending.resolve(new Response(JSON.stringify({ suggestions: ['初音ミク'] }))) })
    expect(screen.getByRole('option', { name: '初音ミク' })).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})
