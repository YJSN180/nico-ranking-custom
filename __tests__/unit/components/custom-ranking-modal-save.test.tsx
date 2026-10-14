import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomRankingModal } from '@/components/custom-ranking-modal'
import type { CustomRankingFormState } from '@/types/custom-ranking'

// カスタムランキング作成モーダルは保存の結果を待ち、保存できたときだけ閉じる。
// 失敗したら入力を残して画面の中で知らせる。タグ名・タイトルは合成値

beforeEach(() => {
  // タグ候補の取得は通信しない
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }))))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type SaveHandler = (data: CustomRankingFormState) => void | boolean | Promise<void | boolean>

async function openTitleStep(onSave: SaveHandler, onClose: () => void): Promise<void> {
  render(<CustomRankingModal isOpen={true} onClose={onClose} onSave={onSave} />)
  fireEvent.click(screen.getByLabelText('ゲーム'))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
  })
  const tagInput = screen.getByPlaceholderText('タグを入力')
  fireEvent.change(tagInput, { target: { value: '合成A' } })
  fireEvent.keyDown(tagInput, { key: 'Enter' })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
  })
  fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成' } })
}

async function clickSave(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
  })
}

describe('カスタムランキング作成: 保存の結果', () => {
  it('保存できなかったら閉じずに知らせ、入力を残す。もう一度保存できる', async () => {
    const onSave = vi.fn(async (): Promise<boolean> => false)
    const onClose = vi.fn()
    await openTitleStep(onSave, onClose)
    await clickSave()

    expect(onSave).toHaveBeenCalledWith({
      baseGenre: 'game',
      conditions: [{ tag: '合成A', operator: 'AND', tagType: 'both' }],
      title: '合成',
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
    expect(screen.getByPlaceholderText('例: レトロゲーム実況')).toHaveValue('合成')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()

    onSave.mockResolvedValueOnce(true)
    await clickSave()
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('タイトルを直したら、前の失敗の知らせは消す', async () => {
    await openTitleStep(vi.fn(async (): Promise<boolean> => false), vi.fn())
    await clickSave()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成2' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('保存の処理が例外を投げても、閉じずに知らせる', async () => {
    const onClose = vi.fn()
    await openTitleStep(vi.fn(async (): Promise<boolean> => { throw new Error('合成の失敗') }), onClose)
    await clickSave()

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('値を返さない保存処理（従来の呼び出し側）は成功として閉じる', async () => {
    const onClose = vi.fn()
    await openTitleStep(vi.fn(), onClose)
    await clickSave()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('保存を待つ間は二重に保存せず、ボタンの状態は変えない。保存できたら閉じる', async () => {
    let finish: (ok: boolean) => void = () => undefined
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const onClose = vi.fn()
    await openTitleStep(onSave, onClose)
    await clickSave()

    const save = screen.getByRole('button', { name: '保存' })
    expect(save).toBeEnabled()
    expect(save).toHaveAttribute('aria-busy', 'true')
    await clickSave()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => { finish(true) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
