import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SettingsModal } from '@/components/settings-modal'
import { CustomRankingModal } from '@/components/custom-ranking-modal'
import { MylistModal } from '@/components/mylist-modal'
import { TagAutocompleteInput } from '@/components/tag-autocomplete-input'

// 日本語入力（IME）で変換中の Esc（変換の取り消し）や Enter（変換の確定）を、
// モーダルを閉じる・項目を追加する操作として扱わないことを確かめる。
// 変換中は isComposing=true、Safari は確定の Enter を keyCode=229 で送ることがある。データはすべて合成値。

vi.mock('@/components/settings-modal.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? key : '') }),
}))

const composing = { isComposing: true }
const safariConfirm = { keyCode: 229 }

function stubSuggestions(suggestions: string[]): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions }))))
}

beforeEach(() => {
  localStorage.clear()
  // タグ候補の取得は通信しない
  stubSuggestions([])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('設定モーダルの NG 入力', () => {
  it('変換を確定する Enter では、入力途中の語を NG に追加しない', () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('sm12345678')

    fireEvent.change(input, { target: { value: 'sm9000' } })
    fireEvent.keyDown(input, { key: 'Enter', ...composing })
    fireEvent.keyDown(input, { key: 'Enter', ...safariConfirm })
    expect(screen.queryByText('sm9000')).toBeNull()

    fireEvent.change(input, { target: { value: 'sm90000001' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('sm90000001')).toBeInTheDocument()
  })
})

describe('タグ入力の候補（NG タグ）', () => {
  it('変換を確定する Enter では追加の処理を呼ばない', () => {
    const onKeyPress = vi.fn()
    render(<TagAutocompleteInput value="げーむ" onChange={vi.fn()} onKeyPress={onKeyPress} placeholder="タグ名を入力" />)
    const input = screen.getByPlaceholderText('タグ名を入力')

    fireEvent.keyDown(input, { key: 'Enter', ...composing })
    fireEvent.keyDown(input, { key: 'Enter', ...safariConfirm })
    expect(onKeyPress).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onKeyPress).toHaveBeenCalledTimes(1)
  })

  it('候補を閉じた Esc だけを preventDefault する', async () => {
    stubSuggestions(['合成タグ候補'])
    function Harness(): JSX.Element {
      const [value, setValue] = React.useState('')
      return <TagAutocompleteInput value={value} onChange={setValue} placeholder="タグ名を入力" />
    }
    render(<Harness />)
    const input = screen.getByPlaceholderText('タグ名を入力')

    fireEvent.change(input, { target: { value: '合成' } })
    await screen.findByText('合成タグ候補', undefined, { timeout: 2000 })

    // fireEvent は既定の動作が取り消されたら false を返す
    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false)
    expect(screen.queryByText('合成タグ候補')).toBeNull()
    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(true)
  })
})

describe('カスタムランキング作成モーダル', () => {
  async function openTagStep(onClose: () => void): Promise<HTMLElement> {
    render(<CustomRankingModal isOpen={true} onClose={onClose} onSave={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('ゲーム'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    })
    return screen.getByPlaceholderText('タグを入力')
  }

  it('変換中の Esc では閉じない（作成途中の内容が消えない）', async () => {
    const onClose = vi.fn()
    const input = await openTagStep(onClose)

    fireEvent.keyDown(input, { key: 'Escape', ...composing })
    fireEvent.keyDown(input, { key: 'Escape', ...safariConfirm })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('変換を確定する Enter では、入力途中のタグを条件に追加しない', async () => {
    const input = await openTagStep(vi.fn())

    fireEvent.change(input, { target: { value: 'げーむ' } })
    fireEvent.keyDown(input, { key: 'Enter', ...composing })
    fireEvent.keyDown(input, { key: 'Enter', ...safariConfirm })
    expect(screen.queryByText('現在の条件:')).toBeNull()

    fireEvent.change(input, { target: { value: '合成タグ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('現在の条件:')).toBeInTheDocument()
  })

  it('候補を閉じる Esc ではモーダルを閉じない。候補が無いときの Esc は閉じる', async () => {
    stubSuggestions(['合成タグ候補'])
    const onClose = vi.fn()
    const input = await openTagStep(onClose)

    fireEvent.change(input, { target: { value: '合成' } })
    await screen.findByText('合成タグ候補', undefined, { timeout: 2000 })

    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false)
    expect(screen.queryByText('合成タグ候補')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('document の Esc でも、preventDefault 済みなら閉じない（App Router ではルートが document）', async () => {
    const onClose = vi.fn()
    await openTagStep(onClose)

    // React の stopPropagation は同じ document のリスナーを止めないため、取り消し済みかで見分ける
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    document.dispatchEvent(handled)
    expect(onClose).not.toHaveBeenCalled()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('マイリスト追加モーダルの新規作成', () => {
  it('変換を確定する Enter では、入力途中の名前でマイリストを作らない', async () => {
    const onCreateMylist = vi.fn(async () => undefined)
    render(
      <MylistModal
        mylists={[]}
        selectedMylistIds={[]}
        onAddToMylist={vi.fn(async () => undefined)}
        onClose={vi.fn()}
        onCreateMylist={onCreateMylist}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '＋ 新規マイリスト作成' }))
    const input = screen.getByPlaceholderText('マイリスト名')

    fireEvent.change(input, { target: { value: 'おきにいり' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', ...composing })
      fireEvent.keyDown(input, { key: 'Enter', ...safariConfirm })
    })
    expect(onCreateMylist).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '合成マイリスト' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(onCreateMylist).toHaveBeenCalledWith('合成マイリスト', '')
  })
})
