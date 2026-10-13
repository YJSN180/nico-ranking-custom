import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagSelector } from '@/components/tag-selector'
import type { RankingConfig } from '@/types/ranking-config'

// カスタムランキングの作成を保存できなかったとき、存在しないランキング（custom:null）へ移らず、
// 作成画面を開いたまま知らせる。保存できたら作成画面を閉じてから表示の準備へ進む。タグ名・タイトルは合成値

const hook = vi.hoisted(() => ({
  createRanking: vi.fn<(data: unknown) => Promise<string | null>>(),
  updateRanking: vi.fn<(id: string, updates: unknown) => Promise<boolean>>(),
  rankings: [] as unknown[],
}))
const toast = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({
    rankings: hook.rankings,
    selectedId: null,
    selectedRanking: null,
    createRanking: hook.createRanking,
    updateRanking: hook.updateRanking,
    deleteRanking: vi.fn(async () => true),
    selectRanking: vi.fn(),
    isLoading: false,
    updateRankingOrder: vi.fn(async () => true),
    toggleVisibility: vi.fn(async () => true),
  }),
}))
vi.mock('@/lib/toast', () => ({ showToast: toast }))

const config: RankingConfig = { period: '24h', genre: 'custom' } as RankingConfig

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }))))
  hook.createRanking.mockReset()
  hook.updateRanking.mockReset()
  hook.rankings = []
  toast.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function createThroughDialog(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /新しく作成する/ }))
  const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
  expect(dialog).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('ゲーム'))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
  })
  const field = screen.getByRole('combobox', { name: 'すべて含むタグを追加' })
  fireEvent.change(field, { target: { value: '合成A' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
  })
  fireEvent.change(screen.getByPlaceholderText('例: レトロゲーム実況'), { target: { value: '合成' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
  })
}

describe('TagSelector: カスタムランキングの保存', () => {
  it('保存できなかったら移動せず、作成画面を開いたまま知らせる', async () => {
    hook.createRanking.mockResolvedValue(null)
    const onConfigChange = vi.fn()
    const onCreateCustomRankingWithFilter = vi.fn(async () => {})
    render(<TagSelector config={config} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await createThroughDialog()

    expect(hook.createRanking).toHaveBeenCalledTimes(1)
    expect(onConfigChange).not.toHaveBeenCalled()
    expect(onCreateCustomRankingWithFilter).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
  })

  it('保存できたら作成画面を閉じ、保存したランキングを用意して表示する', async () => {
    hook.createRanking.mockResolvedValue('synthetic-id')
    const onConfigChange = vi.fn()
    const onCreateCustomRankingWithFilter = vi.fn(async () => {})
    render(<TagSelector config={config} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await createThroughDialog()

    expect(hook.createRanking).toHaveBeenCalledWith({
      title: '合成',
      baseGenre: 'game',
      conditions: [{ tag: '合成A', operator: 'AND', tagType: 'both', orderIndex: 0 }],
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onCreateCustomRankingWithFilter).toHaveBeenCalledWith('synthetic-id', 'game', expect.any(Array), '合成')
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ genre: 'custom', tag: 'custom:synthetic-id' }))
  })

  it('保存のあと表示の準備に失敗したら、保存はできたことと選び直し方を知らせる', async () => {
    hook.createRanking.mockResolvedValue('synthetic-id')
    const onConfigChange = vi.fn()
    render(
      <TagSelector config={config} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={vi.fn(async () => { throw new Error('合成の失敗') })} />,
    )
    await createThroughDialog()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onConfigChange).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('保存しましたが、ランキングを表示できませんでした。一覧から選び直してください。', 'error')
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
  const selected: RankingConfig = { period: '24h', genre: 'custom', tag: 'custom:synthetic-id' } as RankingConfig

  async function editAndSave(): Promise<void> {
    fireEvent.click(screen.getByTitle('編集'))
    await screen.findByRole('dialog', {}, { timeout: 5000 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
    })
  }

  it('更新できなかったら移動せず、編集画面を開いたまま知らせる', async () => {
    hook.rankings = [existing]
    hook.updateRanking.mockResolvedValue(false)
    const onConfigChange = vi.fn()
    const onCreateCustomRankingWithFilter = vi.fn(async () => {})
    render(<TagSelector config={selected} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await editAndSave()

    expect(hook.updateRanking).toHaveBeenCalledWith('synthetic-id', {
      title: '既存',
      baseGenre: 'game',
      conditions: [{ tag: '合成A', operator: 'AND', tagType: 'both', orderIndex: 0 }],
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
    expect(onConfigChange).not.toHaveBeenCalled()
    expect(onCreateCustomRankingWithFilter).not.toHaveBeenCalled()
  })

  it('更新できたら編集画面を閉じ、そのランキングを表示する', async () => {
    hook.rankings = [existing]
    hook.updateRanking.mockResolvedValue(true)
    const onConfigChange = vi.fn()
    render(<TagSelector config={selected} onConfigChange={onConfigChange} onCreateCustomRankingWithFilter={vi.fn(async () => {})} />)
    await editAndSave()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ genre: 'custom', tag: 'custom:synthetic-id' }))
  })

  it('保存できたら、表示の準備を待たずに作成画面を閉じる', async () => {
    hook.createRanking.mockResolvedValue('synthetic-new')
    const onCreateCustomRankingWithFilter = vi.fn(() => new Promise<void>(() => {}))
    render(<TagSelector config={config} onConfigChange={vi.fn()} onCreateCustomRankingWithFilter={onCreateCustomRankingWithFilter} />)
    await createThroughDialog()

    expect(onCreateCustomRankingWithFilter).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
