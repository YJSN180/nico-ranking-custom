import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { SettingsModal } from '@/components/settings-modal'
import { NGTagsSection } from '@/components/ng-tags-section'

// NG リストの各項目の削除ボタン（見た目は「×」）に、どの項目を消すかが読み上げで分かる名前があること。
// 名前が「×」だけだと、スクリーンリーダーではどの NG を消すボタンか区別できない。データはすべて合成値。

vi.mock('@/components/settings-modal.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? key : '') }),
}))

beforeEach(() => {
  localStorage.clear()
})

describe('NG リストの削除ボタンの名前', () => {
  it('設定モーダルの動画 ID・タイトル', () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />)

    const idInput = screen.getByPlaceholderText('sm12345678')
    fireEvent.change(idInput, { target: { value: 'sm90000001' } })
    fireEvent.keyDown(idInput, { key: 'Enter' })

    const titleInput = screen.getByPlaceholderText('タイトルを入力')
    fireEvent.change(titleInput, { target: { value: '合成タイトル' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    expect(screen.getByRole('button', { name: 'sm90000001 を削除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '合成タイトル (部分) を削除' })).toBeInTheDocument()
  })

  it('NG タグ', () => {
    render(
      <NGTagsSection
        tags={{
          locked: { exact: ['合成タグ'], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] },
        }}
        onUpdate={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '合成タグ (ロック・完全) を削除' })).toBeInTheDocument()
  })
})
