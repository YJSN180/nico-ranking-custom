import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomRankingModal } from '@/components/custom-ranking-modal'
import type { CustomRankingFormState } from '@/types/custom-ranking'

// カスタムランキング作成のタグ条件を、検索の「条件で入力」と同じ 3 つの欄で入力する。
// 判定の意味（すべて含む群と、いずれかを含む群の「または」）と保存形式は変えない。タグ名はすべて合成値。

beforeEach(() => {
  // タグ候補の取得は通信しない
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }))))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const field = (lane: string): HTMLElement => screen.getByRole('combobox', { name: `${lane}タグを追加` })

function addTag(lane: string, tag: string): void {
  const input = field(lane)
  fireEvent.change(input, { target: { value: tag } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

async function next(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
  })
}

function openNew(onSave = vi.fn()): ReturnType<typeof vi.fn> {
  render(<CustomRankingModal isOpen={true} onClose={vi.fn()} onSave={onSave} />)
  fireEvent.click(screen.getByLabelText('ゲーム'))
  return onSave
}

describe('カスタムランキング作成: タグ条件', () => {
  it('3 つの欄に加えたタグと種別を、今までと同じ形（AND・OR・NOT と tagType）で保存する', async () => {
    const onSave = openNew()
    await next()

    addTag('すべて含む', '初音ミク')
    addTag('いずれかを含む', '歌ってみた')
    addTag('いずれかを含む', '演奏してみた')
    addTag('含めない', '切り抜き')
    fireEvent.change(screen.getByLabelText('「初音ミク」のタグ種別'), { target: { value: 'lock' } })

    // 「すべて含む」と「いずれかを含む」は「または」でつながる（検索の「かつ」とは違う）
    expect(screen.getByText('または')).toBeInTheDocument()
    expect(
      screen.getByText(
        '「初音ミク」（ロックタグ）が付いた動画、または「歌ってみた」か「演奏してみた」のどちらかが付いた動画が対象です。ただし、「切り抜き」が付いた動画は除きます。',
      ),
    ).toBeInTheDocument()

    await next()
    fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成ランキング' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0]?.[0] as CustomRankingFormState
    expect(saved.baseGenre).toBe('game')
    expect(saved.title).toBe('合成ランキング')
    expect(saved.conditions).toEqual([
      { tag: '初音ミク', operator: 'AND', tagType: 'lock' },
      { tag: '歌ってみた', operator: 'OR', tagType: 'both' },
      { tag: '演奏してみた', operator: 'OR', tagType: 'both' },
      { tag: '切り抜き', operator: 'NOT', tagType: 'both' },
    ])
  })

  it('タグが無ければ次へ進めない。欄に打ちかけのタグは、次へで条件に加える', async () => {
    const onSave = openNew()
    await next()
    const nextButton = screen.getByRole('button', { name: '次へ' })
    expect(nextButton).toBeDisabled()
    expect(screen.getByText('タグを1つ以上加えてください。')).toBeInTheDocument()

    fireEvent.change(field('いずれかを含む'), { target: { value: ' 打ちかけ ' } })
    expect(nextButton).toBeEnabled()
    await next()
    fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((onSave.mock.calls[0]?.[0] as CustomRankingFormState).conditions).toEqual([
      { tag: '打ちかけ', operator: 'OR', tagType: 'both' },
    ])
  })

  it('同じタグ（大文字・小文字の違いを含む）は、別の欄にも加えない', async () => {
    openNew()
    await next()
    addTag('すべて含む', 'VOCALOID')
    addTag('含めない', 'vocaloid')
    expect(screen.getAllByRole('button', { name: /を削除$/ })).toHaveLength(1)
    expect(field('含めない')).toHaveValue('')
  })

  it('空の欄で Enter を押しても、次の手順には進まない', async () => {
    openNew()
    await next()
    addTag('すべて含む', 'A')
    fireEvent.keyDown(field('すべて含む'), { key: 'Enter' })
    expect(screen.getByRole('combobox', { name: 'すべて含むタグを追加' })).toBeInTheDocument()
  })

  it('説明文は欄に打ちかけのタグも含めて示す（次へで加わる内容と同じ）', async () => {
    openNew()
    await next()
    fireEvent.change(field('すべて含む'), { target: { value: '合成A' } })
    expect(screen.getByText('「合成A」が付いた動画が対象です。')).toBeInTheDocument()
    fireEvent.change(field('いずれかを含む'), { target: { value: '合成C' } })
    fireEvent.change(field('含めない'), { target: { value: '合成X' } })
    // 打ちかけでも「すべて含む」と「いずれかを含む」の両方にあれば「または」を示す
    expect(screen.getByText('または')).toBeInTheDocument()
    expect(
      screen.getByText('「合成A」が付いた動画、または「合成C」が付いた動画が対象です。ただし、「合成X」が付いた動画は除きます。'),
    ).toBeInTheDocument()
  })

  it('「または」は、すべて含むといずれかを含むの両方にタグがあるときだけ示す', async () => {
    openNew()
    await next()
    addTag('すべて含む', 'A')
    expect(screen.queryByText('または')).toBeNull()
    addTag('含めない', 'X')
    expect(screen.queryByText('または')).toBeNull()
    addTag('いずれかを含む', 'B')
    expect(screen.getByText('または')).toBeInTheDocument()
  })

  it('タグ名の引用符はそのまま保存する（Enter で加えたタグも、次へで加わる打ちかけのタグも）', async () => {
    const onSave = openNew()
    await next()
    addTag('すべて含む', '"合成"')
    fireEvent.change(field('いずれかを含む'), { target: { value: '"打ちかけ"' } })
    await next()
    fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((onSave.mock.calls[0]?.[0] as CustomRankingFormState).conditions.map((c) => c.tag)).toEqual(['"合成"', '"打ちかけ"'])
  })

  it('同じタグを加えようとしたら、どの欄にあるかを読み上げで知らせる', async () => {
    openNew()
    await next()
    addTag('すべて含む', 'VOCALOID')
    addTag('含めない', 'vocaloid')
    expect(screen.getByRole('status')).toHaveTextContent('「VOCALOID」はすでに「すべて含む」にあります。')
  })

  it('選んだ種別は、チップの見える表示にも出る', async () => {
    openNew()
    await next()
    addTag('すべて含む', 'A')
    const select = screen.getByLabelText('「A」のタグ種別')
    const chipLabel = (): string => select.parentElement?.querySelector('[aria-hidden="true"]')?.textContent ?? ''
    expect(chipLabel()).toBe('全タグ')
    fireEvent.change(select, { target: { value: 'user' } })
    expect(chipLabel()).toBe('ユーザータグ')
  })

  it('編集では保存済みの条件を欄に並べ、種別も引き継ぐ（変更しなければ同じ条件で保存する）', async () => {
    const onSave = vi.fn()
    render(
      <CustomRankingModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
        editingRanking={{
          baseGenre: 'game',
          title: '既存',
          conditions: [
            { tag: 'X', operator: 'NOT', tagType: 'both' },
            { tag: 'A', operator: 'AND', tagType: 'user' },
            { tag: 'B', operator: 'OR', tagType: 'lock' },
          ],
        }}
      />,
    )
    await next()
    expect(screen.getByLabelText('「A」のタグ種別')).toHaveValue('user')
    expect(screen.getByLabelText('「B」のタグ種別')).toHaveValue('lock')
    expect(screen.getByLabelText('「X」のタグ種別')).toHaveValue('both')
    const notLane = field('含めない').closest('div[class*="lane"]')
    expect(notLane).not.toBeNull()
    expect(within(notLane as HTMLElement).getByText('X')).toBeInTheDocument()

    await next()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((onSave.mock.calls[0]?.[0] as CustomRankingFormState).conditions).toEqual([
      { tag: 'A', operator: 'AND', tagType: 'user' },
      { tag: 'B', operator: 'OR', tagType: 'lock' },
      { tag: 'X', operator: 'NOT', tagType: 'both' },
    ])
  })

  it('編集でタグを外すと保存した条件からも消え、外したタグを加え直すと種別は全タグに戻る', async () => {
    const onSave = vi.fn()
    render(
      <CustomRankingModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
        editingRanking={{
          baseGenre: 'game',
          title: '既存',
          conditions: [
            { tag: 'A', operator: 'AND', tagType: 'lock' },
            { tag: 'B', operator: 'OR', tagType: 'user' },
          ],
        }}
      />,
    )
    await next()
    fireEvent.click(screen.getByRole('button', { name: 'Bを削除' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aを削除' }))
    addTag('すべて含む', 'A')
    expect(screen.getByLabelText('「A」のタグ種別')).toHaveValue('both')
    await next()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((onSave.mock.calls[0]?.[0] as CustomRankingFormState).conditions).toEqual([
      { tag: 'A', operator: 'AND', tagType: 'both' },
    ])
  })
})

describe('カスタムランキング作成: ダイアログの操作', () => {
  it('名前の付いたダイアログとして開き、閉じるボタンにも名前がある', () => {
    render(<CustomRankingModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'カスタムランキング作成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
  })

  it('手順が変わったら、その手順の最初の入力へフォーカスを移す（ページへ抜けない）', async () => {
    render(<CustomRankingModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    fireEvent.click(screen.getByLabelText('ゲーム'))
    await next()
    expect(document.activeElement).toBe(field('すべて含む'))
    addTag('すべて含む', 'A')
    await next()
    expect(document.activeElement).toBe(screen.getByPlaceholderText('例: レトロゲーム実況'))
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(document.activeElement).toBe(screen.getByLabelText('ゲーム'))
  })

  it('候補を閉じた Esc（既定の動作が止められている）では閉じない。ふつうの Esc では閉じる', () => {
    const onClose = vi.fn()
    render(<CustomRankingModal isOpen={true} onClose={onClose} onSave={vi.fn()} />)
    // ページ全体で React がイベントを受ける本番では、候補の Esc も document まで届く。その Esc は既定の動作が止められている
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    document.dispatchEvent(handled)
    expect(onClose).not.toHaveBeenCalled()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('先読みを待つ間の「次へ」は止まり、何度押しても次の手順に 1 つだけ進む。待つ間に戻ったら進めない', async () => {
    let finish: () => void = () => {}
    const onPrefetchData = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<CustomRankingModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} onPrefetchData={onPrefetchData} />)
    fireEvent.click(screen.getByLabelText('ゲーム'))
    await next()
    addTag('すべて含む', 'A')
    await next()
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled()
    await next()
    expect(onPrefetchData).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
    expect(screen.getByText('カスタムランキングの名前を決めてください')).toBeInTheDocument()

    // 手順 2 に戻ってもう一度「次へ」→ 待つ間に「戻る」→ 先読みが終わっても手順 3 へ進まない
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    await next()
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    await act(async () => { finish() })
    expect(screen.queryByText('カスタムランキングの名前を決めてください')).toBeNull()
  })
})

describe('カスタムランキング作成: 保存の結果', () => {
  async function fillAndSave(onSave: (data: CustomRankingFormState) => Promise<boolean>, onClose = vi.fn()) {
    render(<CustomRankingModal isOpen={true} onClose={onClose} onSave={onSave} />)
    fireEvent.click(screen.getByLabelText('ゲーム'))
    await next()
    addTag('すべて含む', '合成A')
    await next()
    fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
    })
    return onClose
  }

  it('保存できなかったら閉じずに知らせ、入力を残す。もう一度保存できる', async () => {
    const onSave = vi.fn(async () => false)
    const onClose = await fillAndSave(onSave)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
    expect(screen.getByPlaceholderText('例: レトロゲーム実況')).toHaveValue('合成')
    // 失敗したあとも保存ボタンは押せるまま（無効にしてフォーカスを外さない）
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()

    onSave.mockResolvedValueOnce(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('タイトルを直したら、前の失敗の知らせは消す', async () => {
    await fillAndSave(vi.fn(async () => false))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成2' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('保存の処理が例外を投げても、閉じずに知らせる', async () => {
    const onClose = await fillAndSave(vi.fn(async () => { throw new Error('合成の失敗') }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('保存を待つ間は保存ボタンを止め（二重に保存しない）、保存できたら閉じる', async () => {
    let finish: (ok: boolean) => void = () => {}
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const onClose = vi.fn()
    render(<CustomRankingModal isOpen={true} onClose={onClose} onSave={onSave} />)
    fireEvent.click(screen.getByLabelText('ゲーム'))
    await next()
    addTag('すべて含む', '合成A')
    await next()
    fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
    })
    const save = screen.getByRole('button', { name: '保存' })
    // 待つ間も disabled にはしない（押したボタンにフォーカスを残す）。aria-disabled で知らせ、二重には保存しない
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => { finish(true) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('フォーカスがモーダルの外にあるときの Tab は、モーダルの中へ戻す', () => {
    render(
      <>
        <button type="button">ページのボタン</button>
        <CustomRankingModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} />
      </>,
    )
    const outside = screen.getByRole('button', { name: 'ページのボタン' })
    outside.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })
})
