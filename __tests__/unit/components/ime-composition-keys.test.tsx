import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SettingsModal } from '@/components/settings-modal'
import { CustomRankingModal } from '@/components/custom-ranking-modal'
import { MylistModal } from '@/components/mylist-modal'

// 日本語入力（IME）で変換中の Esc（変換の取り消し）や Enter（変換の確定）を、
// モーダルを閉じる・項目を追加する操作として扱わないことを確かめる。
// 変換中は isComposing=true、Safari は確定の Enter を keyCode=229 で送ることがある。データはすべて合成値。

vi.mock('@/components/settings-modal.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? key : '') }),
}))

const composing = { isComposing: true, keyCode: 229 }

beforeEach(() => {
  localStorage.clear()
  // タグ候補の取得は通信しない
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }))))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('設定モーダル', () => {
  it('変換中の Esc では閉じない（変換の取り消しにだけ使う）', () => {
    const onClose = vi.fn()
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('sm12345678')

    fireEvent.keyDown(input, { key: 'Escape', ...composing })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('変換を確定する Enter では、入力途中の語を NG に追加しない', () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('sm12345678')

    fireEvent.change(input, { target: { value: 'sm9000' } })
    fireEvent.keyDown(input, { key: 'Enter', ...composing })
    expect(screen.queryByText('sm9000')).toBeNull()

    fireEvent.change(input, { target: { value: 'sm90000001' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('sm90000001')).toBeInTheDocument()
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
    expect(onClose).not.toHaveBeenCalled()
  })

  it('変換を確定する Enter では、入力途中のタグを条件に追加しない', async () => {
    const input = await openTagStep(vi.fn())

    fireEvent.change(input, { target: { value: 'げーむ' } })
    fireEvent.keyDown(input, { key: 'Enter', ...composing })
    expect(screen.queryByText('現在の条件:')).toBeNull()

    fireEvent.change(input, { target: { value: '合成タグ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('現在の条件:')).toBeInTheDocument()
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
    })
    expect(onCreateMylist).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '合成マイリスト' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(onCreateMylist).toHaveBeenCalledWith('合成マイリスト', '')
  })
})
