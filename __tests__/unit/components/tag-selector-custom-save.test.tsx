import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagSelector } from '@/components/tag-selector'
import type { RankingConfig } from '@/types/ranking-config'

// カスタムランキングの作成・編集を保存できなかったとき、存在しないランキング（custom:null）へ移らず、
// 作成画面を開いたまま知らせる。保存できたら作成画面を閉じてから表示の準備へ進む。タグ名・タイトルは合成値

const hook = vi.hoisted(() => ({
  createRanking: vi.fn<(data: unknown) => Promise<string | null>>(),
  updateRanking: vi.fn<(id: string, updates: unknown) => Promise<boolean>>(),
  rankings: [] as unknown[],
}))

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({
    rankings: hook.rankings,
    selectedId: undefined,
    selectedRanking: undefined,
    createRanking: hook.createRanking,
    updateRanking: hook.updateRanking,
    deleteRanking: vi.fn(async () => true),
    selectRanking: vi.fn(async () => true),
    isLoading: false,
    updateRankingOrder: vi.fn(async () => true),
    toggleVisibility: vi.fn(async () => true),
  }),
}))

const config: RankingConfig = { period: '24h', genre: 'custom' }
const DIALOG_TITLE_CREATE = 'カスタムランキング作成'
const DIALOG_TITLE_EDIT = 'カスタムランキング編集'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }))))
  vi.stubGlobal('alert', vi.fn())
  hook.createRanking.mockReset()
  hook.updateRanking.mockReset()
  hook.rankings = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function clickButton(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

async function createThroughDialog(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /新しく作成する/ }))
  await screen.findByRole('heading', { name: DIALOG_TITLE_CREATE })
  fireEvent.click(screen.getByLabelText('ゲーム'))
  await clickButton('次へ')
  const field = screen.getByPlaceholderText('タグを入力')
  fireEvent.change(field, { target: { value: '合成A' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  await clickButton('次へ')
  fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成' } })
  await clickButton('保存')
}

describe('TagSelector: カスタムランキングの保存', () => {
  it('保存できなかったら移動せず、作成画面を開いたまま知らせる', async () => {
    hook.createRanking.mockResolvedValue(null)
    const onConfigChange = vi.fn()
    const onCreateCustomRankingWithFilter = vi.fn(async () => undefined)
    render(<TagSelector config={config} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await createThroughDialog()

    expect(hook.createRanking).toHaveBeenCalledTimes(1)
    expect(onConfigChange).not.toHaveBeenCalled()
    expect(onCreateCustomRankingWithFilter).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: DIALOG_TITLE_CREATE })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
  })

  it('保存できたら作成画面を閉じ、保存したランキングを用意して表示する', async () => {
    hook.createRanking.mockResolvedValue('synthetic-id')
    const onConfigChange = vi.fn()
    const onCreateCustomRankingWithFilter = vi.fn(async () => undefined)
    render(<TagSelector config={config} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await createThroughDialog()

    expect(hook.createRanking).toHaveBeenCalledWith({
      title: '合成',
      baseGenre: 'game',
      conditions: [{ tag: '合成A', operator: 'AND', tagType: 'both', orderIndex: 0 }],
    })
    expect(screen.queryByRole('heading', { name: DIALOG_TITLE_CREATE })).toBeNull()
    expect(onCreateCustomRankingWithFilter).toHaveBeenCalledWith('synthetic-id', 'game', expect.any(Array), '合成')
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ genre: 'custom', tag: 'custom:synthetic-id' }))
  })

  it('保存のあと表示の準備に失敗したら、保存はできたことと選び直し方を知らせる', async () => {
    hook.createRanking.mockResolvedValue('synthetic-id')
    const onConfigChange = vi.fn()
    render(
      <TagSelector
        config={config}
        onConfigChange={onConfigChange}
        onCreateCustomRankingWithFilter={vi.fn(async () => { throw new Error('合成の失敗') })}
      />,
    )
    await createThroughDialog()

    expect(screen.queryByRole('heading', { name: DIALOG_TITLE_CREATE })).toBeNull()
    expect(onConfigChange).not.toHaveBeenCalled()
    expect(window.alert).toHaveBeenCalledWith('保存しましたが、ランキングを表示できませんでした。一覧から選び直してください。')
  })

  it('保存できたら、表示の準備を待たずに作成画面を閉じる', async () => {
    hook.createRanking.mockResolvedValue('synthetic-new')
    const onCreateCustomRankingWithFilter = vi.fn(() => new Promise<void>(() => undefined))
    render(<TagSelector config={config} onConfigChange={vi.fn()} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await createThroughDialog()

    expect(onCreateCustomRankingWithFilter).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: DIALOG_TITLE_CREATE })).toBeNull()
  })
})

describe('TagSelector: カスタムランキングの編集の保存', () => {
  const existing = {
    id: 'synthetic-id',
    title: '既存',
    baseGenre: 'game',
    createdAt: 1,
    updatedAt: 1,
    orderIndex: 0,
    isVisible: true,
    conditions: [{ id: 'c1', rankingId: 'synthetic-id', tag: '合成A', operator: 'AND', tagType: 'both', orderIndex: 0 }],
  }
  const selected: RankingConfig = { period: '24h', genre: 'custom', tag: 'custom:synthetic-id' }

  async function editAndSave(): Promise<void> {
    fireEvent.click(screen.getByTitle('編集'))
    await screen.findByRole('heading', { name: DIALOG_TITLE_EDIT })
    await clickButton('次へ')
    await clickButton('次へ')
    await clickButton('保存')
  }

  it('更新できなかったら（false）成功として扱わず、編集画面を開いたまま知らせる', async () => {
    hook.rankings = [existing]
    hook.updateRanking.mockResolvedValue(false)
    const onConfigChange = vi.fn()
    const onCreateCustomRankingWithFilter = vi.fn(async () => undefined)
    render(<TagSelector config={selected} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await editAndSave()

    expect(hook.updateRanking).toHaveBeenCalledWith('synthetic-id', expect.objectContaining({ title: '既存', baseGenre: 'game' }))
    expect(screen.getByRole('heading', { name: DIALOG_TITLE_EDIT })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
    expect(onConfigChange).not.toHaveBeenCalled()
    expect(onCreateCustomRankingWithFilter).not.toHaveBeenCalled()
  })

  it('更新できたら編集画面を閉じ、そのランキングを表示する', async () => {
    hook.rankings = [existing]
    hook.updateRanking.mockResolvedValue(true)
    const onConfigChange = vi.fn()
    render(<TagSelector config={selected} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={vi.fn(async () => undefined)} />)
    await editAndSave()

    expect(screen.queryByRole('heading', { name: DIALOG_TITLE_EDIT })).toBeNull()
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ genre: 'custom', tag: 'custom:synthetic-id' }))
  })
})
